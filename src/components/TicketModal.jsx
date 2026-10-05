import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { ArrowLeft, CheckCircle2, Clock, Minus, Plus, Sparkles, WifiOff } from 'lucide-react';
import Sheet from './Sheet';
import LocationCard from './LocationCard';
import PassCarousel from './PassCarousel';
import { formatEventDate } from '../lib/format';
import { useAuth } from '../lib/authContext';
import { sharedPassUrl } from '../lib/invite';
import {
  keys,
  useCreateOrder,
  useEventPrivate,
  useMyPasses,
  useMyPoints,
  useMyProfile,
  useMyReferral,
  usePlatformSettings,
  useReclaimPass,
  useSharePass,
} from '../lib/queries';
import { ngweeToZmw, zmwToNgwee } from '../lib/mappers';
import { summarisePasses } from '../lib/passes';
import { quoteWithPoints } from '../lib/points';
import { shareOrCopy } from '../lib/useShareLink';

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

// PostgREST's code for an RPC that does not exist yet: the sharing migration
// has not been applied.
const NOT_DEPLOYED = 'PGRST202';
const friendly = (err, fallback) =>
  err?.code === NOT_DEPLOYED ? 'Sending passes is not switched on yet. Try again soon.' : err?.message || fallback;

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
  // Per-pass messages after sending or taking back, keyed by pass id.
  const [notices, setNotices] = useState({});
  const [busyCode, setBusyCode] = useState(null);
  const [usePoints, setUsePoints] = useState(false);
  const sharePass = useSharePass();
  const reclaimPass = useReclaimPass();
  const { data: profile } = useMyProfile(user?.id);
  const { data: referral } = useMyReferral(user?.id);

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
  // Holders are trusted with the exact address, so show it with their passes.
  const { data: location } = useEventPrivate(event?.id, isOpen && showingPasses && Boolean(user));

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

  // Points take money off paid passes, for verified profiles. The quote mirrors
  // create_order; the database works out the real figures.
  const wantsPoints = isOpen && !isFree && Boolean(user);
  const { data: points } = useMyPoints(wantsPoints ? user?.id : null);
  const { data: settings } = usePlatformSettings(wantsPoints);
  const verified = Boolean(profile?.identity_verified_at);
  const quote = quoteWithPoints({
    subtotalNgwee: zmwToNgwee(totalPrice),
    balance: points?.balance ?? 0,
    pointValueNgwee: points?.pointValueNgwee,
    settings,
  });
  // Waits for the fee settings, or the quote would leave the fee out.
  const pointsApplied = usePoints && verified && quote.points > 0 && Boolean(settings);
  const paidInPoints = pointsApplied && quote.total === 0;

  const handlePay = async (e) => {
    e?.preventDefault();
    if (!isFree && !paidInPoints && paymentProvider !== 'card' && !phone.trim()) {
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
        msisdn: paymentProvider === 'card' || paidInPoints ? null : phone,
        // The whole balance is offered; the database uses only what the order
        // needs, so a stale quote can never under- or over-spend.
        points: pointsApplied ? points.balance : 0,
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
          pointsUsed: order.points_used ?? 0,
          pointsOff: ngweeToZmw(order.points_discount_ngwee ?? 0),
        });
      }
    } catch (err) {
      setError(err.message ?? 'Could not create that order. Try again.');
    }
  };

  const notify = (passId, text) => setNotices((n) => ({ ...n, [passId]: text }));

  // Sends one pass as a private link. It stays valid: whoever is scanned first
  // gets in, and after that it is used up for every copy.
  const handleSharePass = async (pass) => {
    setBusyCode(pass.code);
    notify(pass.id, '');
    try {
      const token = await sharePass.mutateAsync(pass.code);
      const result = await shareOrCopy({
        title: `A pass for ${event.name}`,
        text: `I got you a pass to ${event.name} on PAMP. Show the QR at the door. It works once.`,
        url: sharedPassUrl({ token, code: referral?.code ?? undefined }),
      });
      if (result === 'copied') notify(pass.id, 'Link copied. Paste it to your friend.');
      if (result === 'failed') notify(pass.id, 'Could not share or copy the link on this phone.');
    } catch (err) {
      notify(pass.id, friendly(err, 'Could not send that pass. Try again.'));
    } finally {
      setBusyCode(null);
    }
  };

  const handleReclaimPass = async (pass) => {
    setBusyCode(pass.code);
    try {
      await reclaimPass.mutateAsync(pass.code);
      notify(pass.id, 'Taken back. It has a new code, and the link you sent no longer works.');
    } catch (err) {
      notify(pass.id, friendly(err, 'Could not take that pass back. Try again.'));
    } finally {
      setBusyCode(null);
    }
  };

  const handleClose = () => {
    setNotices({});
    setPendingOrder(null);
    setJustClaimed(false);
    setBuyingMore(false);
    setPage(0);
    setQuantity(1);
    setPhone('');
    setError('');
    setUsePoints(false);
    onClose();
  };

  let title = 'Get your pass';
  if (pendingOrder) title = 'Waiting for payment';
  else if (justClaimed && (showingPasses || claimedButUnseen)) title = "You're in";
  else if (showingPasses) title = summary.allIn ? "You're checked in" : myPasses.length > 1 ? 'Your passes' : 'Your pass';

  const purchaseFooter = (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] text-text-muted">{pointsApplied ? 'Total with fee, after points' : 'Total'}</p>
        <p className="text-xl font-bold tracking-tight text-white">
          {isFree ? 'Free' : pointsApplied ? `${currency} ${ngweeToZmw(quote.total)}` : `${currency} ${totalPrice}`}
        </p>
      </div>
      <button type="submit" form={formId} disabled={isProcessing} className="btn-accent px-6">
        {isProcessing ? (
          <>
            <Spinner />
            Confirming…
          </>
        ) : isFree ? (
          'Claim free pass'
        ) : paidInPoints ? (
          'Get pass with points'
        ) : (
          `Pay ${currency} ${pointsApplied ? ngweeToZmw(quote.total) : totalPrice}`
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

          {!isFree && points?.balance > 0 && (
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">
                    {points.balance.toLocaleString()} points
                    <span className="font-normal text-text-muted">
                      {' '}· worth {currency} {ngweeToZmw(points.balance * points.pointValueNgwee).toLocaleString()}
                    </span>
                  </p>
                  <p className="text-[13px] text-text-muted">
                    {!verified
                      ? 'Get verified to spend them: add a profile photo and an admin checks it is you.'
                      : pointsApplied
                        ? paidInPoints
                          ? `Uses ${quote.points.toLocaleString()} points and covers the whole pass.`
                          : `Uses all ${quote.points.toLocaleString()} and takes ${currency} ${ngweeToZmw(quote.discount)} off.`
                        : 'Use them to take money off this pass.'}
                  </p>
                </div>
                {verified && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pointsApplied}
                    aria-label="Use my points"
                    onClick={() => setUsePoints((on) => !on)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
                      pointsApplied ? 'bg-accent' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
                        pointsApplied ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          )}

          {!isFree && !paidInPoints && (
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
            {pendingOrder.pointsUsed > 0 && (
              <div className="flex justify-between">
                <dt className="text-text-muted">{pendingOrder.pointsUsed.toLocaleString()} points</dt>
                <dd className="font-semibold text-green">&minus;{currency} {pendingOrder.pointsOff}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-text-muted">Total due</dt>
              <dd className="font-semibold text-white">{currency} {pendingOrder.total}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[13px] text-text-muted">
            Your pass is issued automatically once payment is confirmed.
            {pendingOrder.pointsUsed > 0 && ' If the order is not paid in time, your points come back.'}
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
            <PassCarousel
              event={event}
              passes={myPasses}
              holderName={profile?.display_name || ''}
              onShare={handleSharePass}
              onReclaim={handleReclaimPass}
              busyCode={busyCode}
              notices={notices}
              focusIndex={page}
            />
          </div>

          <LocationCard location={location} className="mt-6" />
        </div>
      )}
    </Sheet>
  );
}
