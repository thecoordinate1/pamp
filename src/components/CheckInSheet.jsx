import { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { CheckCircle2, Keyboard, RotateCcw, XCircle } from 'lucide-react';
import Sheet from './Sheet';
import { useCheckInTicket, useUndoCheckIn } from '../lib/queries';

export default function CheckInSheet({ open, onClose }) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const lastCodeRef = useRef('');

  const onDecodeRef = useRef(() => {});
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const checkIn = useCheckInTicket();
  const undo = useUndoCheckIn();

  const submitCode = async (code) => {
    const trimmed = (code ?? '').trim().toUpperCase();
    if (!trimmed) return;
    setError('');
    try {
      const row = await checkIn.mutateAsync(trimmed);
      setResult(row);
      if (navigator.vibrate) navigator.vibrate(row.was_already_in ? [40, 60, 40] : 60);
    } catch (err) {
      setResult(null);
      setError(err.message ?? 'Could not check that pass in.');
    }
  };

  // The camera fires continuously on the same code while it stays in frame, so
  // ignore repeats until a different code is seen.
  const handleDecode = (value) => {
    if (value === lastCodeRef.current) return;
    lastCodeRef.current = value;
    submitCode(value);
  };

  useEffect(() => {
    onDecodeRef.current = handleDecode;
  });

  useEffect(() => {
    if (!open || manualMode) return undefined;
    let cancelled = false;

    (async () => {
      try {
        if (!(await QrScanner.hasCamera())) {
          if (!cancelled) {
            setCameraError('No camera found. Enter the code instead.');
            setManualMode(true);
          }
          return;
        }
        if (cancelled || !videoRef.current) return;
        const scanner = new QrScanner(videoRef.current, (r) => onDecodeRef.current(r.data), {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: 'environment',
        });
        scannerRef.current = scanner;
        await scanner.start();
      } catch {
        if (!cancelled) {
          setCameraError('Could not open the camera. Enter the code instead.');
          setManualMode(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, [open, manualMode]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError('');
      setManualCode('');
      lastCodeRef.current = '';
    }
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Door check-in" subtitle="Scan a guest's pass to let them in.">
      <div className="space-y-4">
        {!manualMode ? (
          <div className="relative overflow-hidden rounded-3xl bg-black aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitCode(manualCode);
              setManualCode('');
            }}
          >
            <label htmlFor="checkin-code" className="field-label">Pass code</label>
            <div className="flex gap-2">
              <input
                id="checkin-code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="4AAD6277"
                autoComplete="off"
                maxLength={8}
                className="input-dark font-mono tracking-widest"
              />
              <button type="submit" disabled={checkIn.isPending} className="btn-accent px-5">
                {checkIn.isPending ? '…' : 'Check in'}
              </button>
            </div>
          </form>
        )}

        {cameraError && <p className="text-[13px] text-text-muted">{cameraError}</p>}

        <button
          type="button"
          onClick={() => { setManualMode((m) => !m); setCameraError(''); }}
          className="btn-secondary w-full"
        >
          <Keyboard className="w-4 h-4" />
          {manualMode ? 'Use the camera' : 'Enter code by hand'}
        </button>

        {error && (
          <div role="alert" className="card flex items-center gap-3 border-red/25 bg-red/5 p-4">
            <XCircle className="w-6 h-6 text-red shrink-0" />
            <p className="text-sm text-white">{error}</p>
          </div>
        )}

        {result && (
          <div
            role="status"
            className={`card flex items-center gap-3 p-4 ${
              result.was_already_in ? 'border-amber/25 bg-amber/5' : 'border-green/25 bg-green/5'
            }`}
          >
            <CheckCircle2 className={`w-7 h-7 shrink-0 ${result.was_already_in ? 'text-amber' : 'text-green'}`} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white truncate">{result.holder_name}</p>
              <p className="text-sm text-text-secondary truncate">
                {result.was_already_in ? 'Already checked in' : 'Checked in'} · {result.code}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await undo.mutateAsync(result.code);
                setResult(null);
                lastCodeRef.current = '';
              }}
              className="text-sm font-medium text-text-secondary hover:text-white shrink-0"
            >
              <RotateCcw className="w-4 h-4 inline mr-1" />
              Undo
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
