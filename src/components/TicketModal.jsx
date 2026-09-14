import { useId, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Minus, Plus } from 'lucide-react';
import Sheet from './Sheet';
import { formatEventDate } from '../lib/format';

const PROVIDERS = [
  { id: 'momo', name: 'MTN MoMo', dot: '#FFCB05' },
  { id: 'airtel', name: 'Airtel Money', dot: '#FF3B30' },
  { id: 'card', name: 'Card', dot: '#A0A0A0' },
];

function Spinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />;
}

export default function TicketModal({ event, isOpen, onClose }) {
  const formId = useId();
  const [quantity, setQuantity] = useState(1);
  const [paymentProvider, setPaymentProvider] = useState('momo');
  const [phone, setPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ticketIssued, setTicketIssued] = useState(null);
  const [error, setError] = useState('');

  const unitPrice = event?.ticketPrice || 0;
  const totalPrice = unitPrice * quantity;
  const currency = event?.currency || 'ZMW';
  const isFree = unitPrice === 0;

  const handlePay = (e) => {
    e?.preventDefault();
    if (!isFree && paymentProvider !== 'card' && !phone.trim()) {
      setError('Enter your mobile money number.');
      return;
    }
    setError('');
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      const ticketId = `PAMP-TIX-${Math.floor(100000 + Math.random() * 900000)}`;
      setTicketIssued({
        ticketId,
        eventName: event.name,
        date: event.date,
        time: event.time,
        area: event.area,
        quantity,
        totalPaid: totalPrice,
        currency,
        holderPhone: phone || 'Paid by Card',
        purchasedAt: new Date().toLocaleDateString()
      });

      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
    }, 2000);
  };

  const handleReset = () => {
    setTicketIssued(null);
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
      title={ticketIssued ? "You're in" : 'Get your pass'}
      subtitle={event?.name}
      footer={ticketIssued ? issuedFooter : purchaseFooter}
    >
      {event && !ticketIssued && (
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
              <QRCodeSVG
                value={JSON.stringify({
                  tix: ticketIssued.ticketId,
                  evt: ticketIssued.eventName,
                  qty: ticketIssued.quantity
                })}
                size={168}
                level="H"
              />
              <dl className="mt-5 w-full grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-black/50">Pass ID</dt>
                  <dd className="font-mono text-[13px] font-semibold">{ticketIssued.ticketId.replace('PAMP-TIX-', '')}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-black/50">Admits</dt>
                  <dd className="text-[13px] font-semibold">{ticketIssued.quantity}</dd>
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
