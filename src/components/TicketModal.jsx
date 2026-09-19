import { useId, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Clock, Minus, Plus } from 'lucide-react';
import Sheet from './Sheet';
import { formatEventDate } from '../lib/format';
import { useCreateOrder, useOrderTickets } from '../lib/queries';
import { ngweeToZmw } from '../lib/mappers';

const PROVIDERS = [
  { id: 'mtn', name: 'MTN MoMo', dot: '#FFCB05' },
  { id: 'airtel', name: 'Airtel Money', dot: '#FF3B30' },
  { id: 'card', name: 'Card', dot: '#A0A0A0' },
];

function Spinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />;
}

export default function TicketModal({ event, isOpen, onClose }) {
  const formId = useId();
  const [quantity, setQuantity] = useState(1);
  const [paymentProvider, setPaymentProvider] = useState('mtn');
  const [phone, setPhone] = useState('');
  const [ticketIssued, setTicketIssued] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [error, setError] = useState('');

  const createOrder = useCreateOrder();
  const isProcessing = createOrder.isPending;
  const { data: tickets = [] } = useOrderTickets(ticketIssued?.orderId);

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
      // The database sets the price, the fee and whether the order is paid.
      // Nothing about money is trusted from this form.
      const order = await createOrder.mutateAsync({
        eventId: event.id,
        quantity,
        method: isFree ? 'free' : paymentProvider,
        msisdn: paymentProvider === 'card' ? null : phone,
      });

      if (order.status === 'paid') {
        setTicketIssued({
          orderId: order.id,
          eventName: event.name,
          date: event.date,
          time: event.time,
          area: event.area,
          quantity: order.quantity,
          totalPaid: ngweeToZmw(order.total_ngwee),
          currency,
        });
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
      } else {
        // Paid events wait on a provider to confirm. Until one is connected the
        // order is real and held, but no pass is issued.
        setPendingOrder({
          id: order.id,
          total: ngweeToZmw(order.total_ngwee),
          fee: ngweeToZmw(order.fee_ngwee),
        });
      }
    } catch (err) {
      setError(err.message ?? 'Could not create that order. Try again.');
    }
  };

  const handleReset = () => {
    setTicketIssued(null);
    setPendingOrder(null);
    setQuantity(1);
    setPhone('');
    setError('');
    onClose();
  };

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

  const issuedFooter = (
    <button type="button" onClick={handleReset} className="btn-accent w-full">
      Done
    </button>
  );

  return (
    <Sheet
      open={isOpen && Boolean(event)}
      onClose={handleReset}
      title={ticketIssued ? "You're in" : pendingOrder ? 'Waiting for payment' : 'Get your pass'}
      subtitle={event?.name}
      footer={ticketIssued || pendingOrder ? issuedFooter : purchaseFooter}
    >
      {event && !ticketIssued && !pendingOrder && (
        <form id={formId} onSubmit={handlePay} className="space-y-6">
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
              <p className="text-[13px] text-text-muted">{isFree ? 'Free entry' : `${currency} ${unitPrice} each`}</p>
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
                onClick={() => setQuantity(quantity + 1)}
                className="btn-icon w-9 h-9"
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
              <dd className="font-semibold text-white">{quantity}</dd>
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

      {ticketIssued && (
        <div className="text-center">
          <span className="mx-auto flex w-14 h-14 items-center justify-center rounded-full bg-green/15 text-green">
            <CheckCircle2 className="w-7 h-7" />
          </span>
          <p className="mt-3 text-text-secondary">Show this code at the door.</p>

          <div className="mt-6 overflow-hidden rounded-3xl text-left shadow-[0_24px_60px_rgba(124,77,255,0.25)]">
            <div className="brand-gradient px-5 py-4 text-white">
              <p className="text-[13px] font-semibold text-white/80">PAMP pass</p>
              <p className="mt-0.5 text-lg font-bold leading-snug">{ticketIssued.eventName}</p>
              <p className="text-sm text-white/90">
                {formatEventDate(ticketIssued.date, ticketIssued.time)} · {ticketIssued.area}
              </p>
            </div>
            <div className="bg-white px-5 py-6 flex flex-col items-center text-[#0D0D0D]">
              <QRCodeSVG value={tickets[0]?.code ?? ''} size={168} level="H" />
              <dl className="mt-5 w-full grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-black/50">Pass ID</dt>
                  <dd className="font-mono text-[13px] font-semibold">{tickets[0]?.code ?? '...'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-black/50">Admits</dt>
                  <dd className="text-[13px] font-semibold">{tickets.length || ticketIssued.quantity}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-black/50">Paid</dt>
                  <dd className="text-[13px] font-semibold">
                    {ticketIssued.totalPaid === 0 ? 'Free' : `${ticketIssued.currency} ${ticketIssued.totalPaid}`}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
