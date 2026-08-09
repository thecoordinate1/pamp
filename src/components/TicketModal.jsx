import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { X, CheckCircle2, ShieldCheck, Ticket, Phone, CreditCard, Sparkles, Download } from 'lucide-react';

export default function TicketModal({ event, isOpen, onClose }) {
  const [quantity, setQuantity] = useState(1);
  const [paymentProvider, setPaymentProvider] = useState('momo');
  const [phone, setPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ticketIssued, setTicketIssued] = useState(null);

  if (!isOpen || !event) return null;

  const unitPrice = event.ticketPrice || 0;
  const totalPrice = unitPrice * quantity;

  const handlePay = (e) => {
    e.preventDefault();
    if (unitPrice > 0 && !phone && paymentProvider !== 'card') {
      alert('Please enter your Mobile Money phone number.');
      return;
    }

    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      const ticketId = `PAMP-TIX-${Math.floor(100000 + Math.random() * 900000)}`;
      const issuedPass = {
        ticketId,
        eventName: event.name,
        date: event.date,
        time: event.time,
        area: event.area,
        quantity,
        totalPaid: totalPrice,
        currency: event.currency || 'ZMW',
        holderPhone: phone || 'Paid by Card',
        purchasedAt: new Date().toLocaleDateString()
      };
      setTicketIssued(issuedPass);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }, 2000);
  };

  const handleReset = () => {
    setTicketIssued(null);
    setQuantity(1);
    setPhone('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-surface border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={handleReset}
          className="absolute top-4 right-4 p-2 text-text-secondary hover:text-white bg-white/5 rounded-full hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {!ticketIssued ? (
          <div className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white leading-tight">Secure Entry Pass</h3>
                <p className="text-xs text-text-secondary">{event.name}</p>
              </div>
            </div>

            {/* Event Summary Box */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-6">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                    {event.vibe}
                  </span>
                  <h4 className="font-semibold text-sm text-white">{event.name}</h4>
                </div>
                <div className="text-right">
                  <span className="text-xs text-text-secondary">Price per pass</span>
                  <div className="font-bold text-sm text-accent">
                    {unitPrice === 0 ? 'FREE' : `${event.currency || 'ZMW'} ${unitPrice}`}
                  </div>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <span className="text-xs text-text-secondary font-medium">Quantity</span>
                <div className="flex items-center gap-3 bg-slate-900 border border-white/10 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-7 h-7 rounded-lg bg-white/5 text-white flex items-center justify-center hover:bg-white/10 font-bold"
                  >
                    -
                  </button>
                  <span className="text-sm font-bold px-2">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-7 h-7 rounded-lg bg-white/5 text-white flex items-center justify-center hover:bg-white/10 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Payment Method Selector (Only if not free) */}
            {unitPrice > 0 ? (
              <form onSubmit={handlePay} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-2">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentProvider('momo')}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        paymentProvider === 'momo'
                          ? 'border-yellow-500/80 bg-yellow-500/10 text-white'
                          : 'border-white/5 bg-white/5 text-text-secondary hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold text-xs text-yellow-400">MTN MoMo</div>
                      <div className="text-[10px] text-text-secondary">Instant Prompt</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentProvider('airtel')}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        paymentProvider === 'airtel'
                          ? 'border-red-500/80 bg-red-500/10 text-white'
                          : 'border-white/5 bg-white/5 text-text-secondary hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold text-xs text-red-400">Airtel Money</div>
                      <div className="text-[10px] text-text-secondary">Instant Prompt</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentProvider('card')}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        paymentProvider === 'card'
                          ? 'border-accent/80 bg-accent/10 text-white'
                          : 'border-white/5 bg-white/5 text-text-secondary hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold text-xs text-cyan-400">Card / Visa</div>
                      <div className="text-[10px] text-text-secondary">Online Pay</div>
                    </button>
                  </div>
                </div>

                {paymentProvider !== 'card' && (
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Mobile Money Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-text-secondary absolute left-3 top-3.5" />
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 0971234567 or 0961234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                )}

                {/* Total & Checkout Button */}
                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-text-secondary">Total Amount</div>
                    <div className="text-xl font-black text-white">
                      {event.currency || 'ZMW'} {totalPrice}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="btn-accent px-6 py-3 text-sm font-bold flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Authorizing...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Pay & Generate Pass
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* Free Event Ticket Trigger */
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-text-secondary">Total</div>
                  <div className="text-xl font-black text-emerald-400">FREE ENTRY</div>
                </div>

                <button
                  type="button"
                  onClick={handlePay}
                  disabled={isProcessing}
                  className="btn-accent px-6 py-3 text-sm font-bold flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Claiming Pass...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> Claim Free Pass
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Digital Ticket Pass View (Issued) */
          <div className="p-6 md:p-8 text-center bg-gradient-to-b from-slate-900 to-surface">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Entry Pass Confirmed!</h3>
            <p className="text-xs text-text-secondary mb-6">Show this digital QR pass at the entrance</p>

            {/* Ticket Card Container */}
            <div className="bg-slate-950 border border-white/10 rounded-2xl p-6 mb-6 shadow-xl relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                VIP Verified
              </div>

              <h4 className="font-black text-lg text-white mb-1">{ticketIssued.eventName}</h4>
              <p className="text-xs text-accent font-semibold mb-4">📍 {ticketIssued.area}</p>

              {/* QR Code */}
              <div className="bg-white p-4 rounded-xl inline-block my-2 mx-auto shadow-md">
                <QRCodeSVG
                  value={JSON.stringify({
                    tix: ticketIssued.ticketId,
                    evt: ticketIssued.eventName,
                    qty: ticketIssued.quantity
                  })}
                  size={140}
                  level="H"
                />
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 text-xs space-y-1 text-text-secondary">
                <div className="flex justify-between">
                  <span>Pass ID:</span>
                  <span className="font-mono text-white font-bold">{ticketIssued.ticketId}</span>
                </div>
                <div className="flex justify-between">
                  <span>Passes:</span>
                  <span className="text-white font-semibold">{ticketIssued.quantity} Person(s)</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid:</span>
                  <span className="text-emerald-400 font-bold">
                    {ticketIssued.totalPaid === 0 ? 'FREE' : `${ticketIssued.currency} ${ticketIssued.totalPaid}`}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="btn-accent w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
            >
              Done & Save To Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
