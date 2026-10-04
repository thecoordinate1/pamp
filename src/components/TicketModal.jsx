import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock, Minus, Plus, WifiOff } from 'lucide-react';
import Sheet from './Sheet';
import { formatEventDate } from '../lib/format';
import { useAuth } from '../lib/authContext';
import { keys, useCreateOrder, useMyPasses } from '../lib/queries';
import { ngweeToZmw } from '../lib/mappers';
import { summarisePasses } from '../lib/passes';

const PROVIDERS = [
  { id: 'mtn', name: 'MTN MoMo', dot: '#FFCB05' },
  { id: 'airtel', name: 'Airtel Money', dot: '#FF3B30' },
  { id: 'card', name: 'Card', dot: '#A0A0A0' },
];

function Spinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />;
}

const celebrate = () =>
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// One pass admits one person: the QR the host scans, the ID to type in when a
// camera will not read it, and whether it has been used yet.
function PassCard({ event, pass, index, total }) {
  const inside = pass.status === 'checked_in';
  return (
    <div className="overflow-hidden rounded-3xl text-left shadow-[0_24px_60px_rgba(124,77,255,0.25)]">
      <div className="brand-gradient px-5 py-4 text-white">
        <p className="text-[13px] font-semibold text-white/80">
          PAMP pass{total > 1 ? ` · ${index + 1} of ${total}` : ''}
        </p>
        <p className="mt-0.5 text-lg font-bold leading-snug">{event.name}</p>
        <p className="text-sm text-white/90">
          {formatEventDate(event.date, event.time)} · {event.area}
        </p>
      </div>
      <div className="bg-white px-5 py-6 flex flex-col items-center text-[#0D0D0D]">
        <QRCodeSVG value={pass.code} size={176} level="H" />
        <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-black/50">Pass ID</p>
        <p className="font-mono text-2xl font-bold tracking-[0.2em]">{pass.code}</p>
        <p
          className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
            inside ? 'bg-[#16a34a]/12 text-[#15803d]' : 'bg-black/5 text-black/60'
          }`}
        >
          {inside ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Checked in{pass.checkedInAt ? ` at ${timeOf(pass.checkedInAt)}` : ''}
            </>
          ) : (
            'Not scanned yet · admits one'
          )}
        </p>
      </div>
    </div>
  );
}

export default function TicketModal({ event, isOpen, onClose }) {
  const formId = useId();
  const { user, offlineUserId } = useAuth();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [paymentProvider, setPaymentProvider] = useState('mtn');
  const [phone, setPhone] = useState('');
  const [pendingOrder, setPendingOrder] = useState(null);
  const [justClaimed, setJustClaimed] = useState(false);
  const [buyingMore, setBuyingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');

  const createOrder = useCreateOrder();
  const isProcessing = createOrder.isPending;

  // Passes come from the database rather than this sheet's state, so they are
  // still here after a reload, on another phone, or with no signal at all.
  const {
    data: allPasses = [],
    isError: offline,
    isFetching,
    refetch,
  } = useMyPasses(user?.id ?? offlineUserId, {
    watchEventId: isOpen && user ? event?.id : undefined,
    fetch: Boolean(user),
  });
  const myPasses = useMemo(
    () => allPasses.filter((p) => p.eventId === event?.id),
    [allPasses, event?.id]
  );
  const summary = summarisePasses(myPasses);
  const showingPasses = myPasses.length > 0 && !buyingMore && !pendingOrder;
  const claimedButUnseen = justClaimed && myPasses.length === 0 && !pendingOrder;
  const currentPage = Math.min(page, Math.max(0, myPasses.length - 1));

  // The host's scan reaches this phone by polling. Mark the moment it lands.
  const seenCheckIns = useRef(null);
  useEffect(() => {
    if (!isOpen) {
      seenCheckIns.current = null;
      return;
    }
    if (seenCheckIns.current !== null && summary.checkedIn > seenCheckIns.current) {
      celebrate();
      // The event's attended count moved too.
      queryClient.invalidateQueries({ queryKey: keys.events });
    }
    seenCheckIns.current = summary.checkedIn;
  }, [isOpen, summary.checkedIn, queryClient]);

  const unitPrice = event?.ticketPrice || 0;
  const totalPrice = unitPrice * quantity;
  const currency = event?.currency || 'ZMW';
  const isFree = unitPrice === 0;

  const handlePay = async (e) => {
    e?.preventDefault();
    if (!isFree && paymentProvider !== 'card' && !phone.trim()) {
      setError('Enter your mobile money number.');
      return;
    }
    setError('');

    try {
      // The database sets the price, the fee and whether the order is paid, and
      // hands back an existing free pass rather than minting another.
      const order = await createOrder.mutateAsync({
        eventId: event.id,
        quantity,
        method: isFree ? 'free' : paymentProvider,
        msisdn: paymentProvider === 'card' ? null : phone,
      });

      if (order.status === 'paid') {
        // New passes are added after existing ones, so open on the first new one.
        setPage(buyingMore ? myPasses.length : 0);
        setBuyingMore(false);
        setJustClaimed(true);
        celebrate();
      } else {
        // Paid events wait on a provider to confirm. Until one is connected the
        // order is real and held, but no pass is issued.
        setPendingOrder({
          id: order.id,
          quantity: order.quantity,
          total: ngweeToZmw(order.total_ngwee),
          fee: ngweeToZmw(order.fee_ngwee),
        });
      }
    } catch (err) {
      setError(err.message ?? 'Could not create that order. Try again.');
    }
  };

  const handleClose = () => {
    setPendingOrder(null);
    setJustClaimed(false);
    setBuyingMore(false);
    setPage(0);
    setQuantity(1);
    setPhone('');
    setError('');
    onClose();
  };

  let title = 'Get your pass';
  if (pendingOrder) title = 'Waiting for payment';
  else if (justClaimed && (showingPasses || claimedButUnseen)) title = "You're in";
  else if (showingPasses) title = summary.allIn ? "You're checked in" : myPasses.length > 1 ? 'Your passes' : 'Your pass';

  const purchaseFooter = (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] text-text-muted">Total</p>
        <p className="text-xl font-bold tracking-tight text-white">{isFree ? 'Free' : `${currency} ${totalPrice}`}</p>
      </div>
      <button type="submit" form={formId} disabled={isProcessing} className="btn-accent px-6">
        {isProcessing ? (
          <>
            <Spinner />
            Confirming…
          </>
        ) : isFree ? (
          'Claim free pass'
        ) : (
          `Pay ${currency} ${totalPrice}`
        )}
      </button>
    </div>
  );

  const passesFooter = (
    <div className="flex gap-3">
      {!isFree && (
        <button
          type="button"
          onClick={() => {
            setBuyingMore(true);
            setJustClaimed(false);
            setError('');
          }}
          className="btn-secondary flex-1"
        >
          Buy more
        </button>
      )}
      <button type="button" onClick={handleClose} className="btn-accent flex-1">
        Done
      </button>
    </div>
  );

  const doneFooter = (
    <button type="button" onClick={handleClose} className="btn-accent w-full">
      Done
    </button>
  );

  let footer = purchaseFooter;
  if (showingPasses) footer = passesFooter;
  else if (pendingOrder || claimedButUnseen) footer = doneFooter;

  return (
    <Sheet open={isOpen && Boolean(event)} onClose={handleClose} title={title} subtitle={event?.name} footer={footer}>
      {event && !showingPasses && !pendingOrder && !claimedButUnseen && (
        <form id={formId} onSubmit={handlePay} className="space-y-6">
          {buyingMore && (
            <button
              type="button"
              onClick={() => setBuyingMore(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to my passes
            </button>
          )}

          <div className="flex items-center gap-4">
            <img src={event.image} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">{formatEventDate(event.date, event.time)}</p>
              <p className="font-semibold text-white truncate">{event.name}</p>
              <p className="text-sm text-text-secondary truncate">{event.area}</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
            <div>
              <p className="font-medium text-white">Passes</p>
              <p className="text-[13px] text-text-muted">
                {isFree ? 'Free entry · you can claim once' : `${currency} ${unitPrice} each`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity === 1}
                className="btn-icon w-9 h-9 disabled:opacity-40"
                aria-label="Remove a pass"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-6 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                disabled={quantity === 10}
                className="btn-icon w-9 h-9 disabled:opacity-40"
                aria-label="Add a pass"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isFree && (
            <>
              <fieldset>
                <legend className="field-label">Pay with</legend>
                <div className="grid grid-cols-3 gap-2">
                  {PROVIDERS.map((provider) => {
                    const selected = paymentProvider === provider.id;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPaymentProvider(provider.id)}
                        className={`min-h-[64px] rounded-2xl px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-200 ${
                          selected
                            ? 'bg-accent/10 shadow-[inset_0_0_0_1.5px_#E040FB]'
                            : 'bg-white/5 hover:bg-white/8'
                        }`}
                      >
                        <span className="block w-2 h-2 rounded-full mb-2" style={{ background: provider.dot }} aria-hidden="true" />
                        <span className="block text-sm font-semibold text-white leading-tight">{provider.name}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {paymentProvider !== 'card' && (
                <div>
                  <label htmlFor={`${formId}-phone`} className="field-label">
                    Mobile money number
                  </label>
                  <input
                    id={`${formId}-phone`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="097 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input-dark"
                  />
                  <p className="mt-2 text-[13px] text-text-muted">You'll get a prompt on your phone to approve.</p>
                </div>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-red">
              {error}
            </p>
          )}
        </form>
      )}

      {pendingOrder && (
        <div className="text-center">
          <span className="mx-auto flex w-14 h-14 items-center justify-center rounded-full bg-amber/15 text-amber">
            <Clock className="w-7 h-7" />
          </span>
          <h3 className="mt-3 text-lg font-semibold text-white">Order held</h3>
          <p className="mt-1 text-text-secondary">
            Your order is reserved, but no mobile money provider is connected to PAMP
            yet, so it cannot be charged.
          </p>
          <dl className="card mt-6 space-y-2 p-4 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Passes</dt>
              <dd className="font-semibold text-white">{pendingOrder.quantity}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Service fee</dt>
              <dd className="font-semibold text-white">{currency} {pendingOrder.fee}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Total due</dt>
              <dd className="font-semibold text-white">{currency} {pendingOrder.total}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[13px] text-text-muted">
            Your pass is issued automatically once payment is confirmed.
          </p>
        </div>
      )}

      {claimedButUnseen && (
        <div className="text-center">
          <span className="mx-auto flex w-14 h-14 items-center justify-center rounded-full bg-green/15 text-green">
            <CheckCircle2 className="w-7 h-7" />
          </span>
          <p className="mt-3 text-text-secondary">
            Your pass is confirmed. It will show here as soon as your connection is back.
          </p>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="btn-secondary mt-5">
            {isFetching ? 'Checking…' : 'Try again'}
          </button>
        </div>
      )}

      {showingPasses && (
        <div>
          <p
            role="status"
            aria-live="polite"
            className={`text-center text-sm ${summary.attended ? 'text-green' : 'text-text-secondary'}`}
          >
            {summary.allIn
              ? "You're checked in. Enjoy the night!"
              : summary.attended
                ? `${summary.checkedIn} of ${summary.count} checked in`
                : 'Show this at the door. It updates here when the host scans it.'}
          </p>
          {offline && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] text-text-muted">
              <WifiOff className="w-3.5 h-3.5" />
              No connection. Showing the pass saved on this phone.
            </p>
          )}

          <div className="mt-5">
            <PassCard event={event} pass={myPasses[currentPage]} index={currentPage} total={myPasses.length} />
          </div>

          {myPasses.length > 1 && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="btn-icon w-10 h-10 disabled:opacity-40"
                aria-label="Previous pass"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-text-secondary tabular-nums">
                Pass {currentPage + 1} of {myPasses.length}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(myPasses.length - 1, currentPage + 1))}
                disabled={currentPage === myPasses.length - 1}
                className="btn-icon w-10 h-10 disabled:opacity-40"
                aria-label="Next pass"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
