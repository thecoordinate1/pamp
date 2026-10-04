import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Share2 } from 'lucide-react';
import Sheet from './Sheet';
import { useAuth } from '../lib/authContext';
import { formatEventDate } from '../lib/format';
import { inviteUrl } from '../lib/invite';
import { useMyReferral } from '../lib/queries';
import { useShareLink } from '../lib/useShareLink';

// An event's invite: a QR a friend can scan off this screen, and a link for
// WhatsApp and the rest. Both carry the sharer's referral code, so anyone who
// signs up through it is credited to them.
export default function ShareSheet({ event, open, onClose }) {
  const { user } = useAuth();
  const { data: referral, isLoading } = useMyReferral(user?.id);
  // Without a code the link still opens the event; it just credits nobody.
  const url = event ? inviteUrl({ eventId: event.id, code: referral?.code ?? undefined }) : '';
  const { copy, share, copied, canShare, error } = useShareLink(url, {
    title: event?.name,
    text: event ? `Come with me to ${event.name} on PAMP` : '',
  });

  const footer = (
    <div className="flex gap-3">
      <button type="button" onClick={copy} className="btn-secondary flex-1">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {canShare && (
        <button type="button" onClick={share} className="btn-accent flex-1">
          <Share2 className="w-4 h-4" />
          Share
        </button>
      )}
    </div>
  );

  return (
    <Sheet open={open && Boolean(event)} onClose={onClose} title="Share this event" subtitle={event?.name} footer={footer}>
      {event && (
        <div className="text-center">
          <div className="mx-auto w-fit rounded-3xl bg-white p-5">
            {isLoading ? (
              <div className="w-[200px] h-[200px] rounded-xl bg-black/5 animate-pulse" aria-hidden="true" />
            ) : (
              <QRCodeSVG value={url} size={200} level="M" />
            )}
          </div>
          <p className="mt-4 font-semibold text-white">{event.name}</p>
          <p className="text-sm text-text-secondary">
            {formatEventDate(event.date, event.time)} · {event.area}
          </p>
          <p className="mt-4 text-[13px] text-text-muted">
            Friends can scan this or open the link.
            {referral?.code && ' Anyone who signs up through it is credited to you.'}
          </p>
          <p className="mt-3 break-all rounded-2xl bg-white/5 px-4 py-3 font-mono text-[13px] text-text-secondary select-all">
            {url}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
