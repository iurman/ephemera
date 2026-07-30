"use client";

import { useState } from "react";
import { Modal, CopyButton, Button } from "@/components/ui";
import { formatDuration } from "@/lib/utils";
import type { CreatedDrop } from "./CreateDropForm";

interface ShareResultProps {
  drop: CreatedDrop | null;
  onClose: () => void;
}

export function ShareResult({ drop, onClose }: ShareResultProps) {
  return (
    <Modal open={!!drop} onClose={onClose} title="Drop created">
      {/* Keyed so QR state resets whenever a new drop is shown. */}
      {drop && <ShareResultBody key={drop.shareUrl} drop={drop} onClose={onClose} />}
    </Modal>
  );
}

function ShareResultBody({ drop, onClose }: { drop: CreatedDrop; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  async function toggleQr() {
    if (qr) {
      setQr(null);
      return;
    }
    setQrLoading(true);
    try {
      const { default: QRCode } = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(drop.shareUrl, {
        width: 220,
        margin: 1,
        color: { dark: "#0c0b0a", light: "#f5f2ee" },
      });
      setQr(dataUrl);
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-2 border-line rounded-xl border p-3">
        <p className="text-ink-muted font-mono text-xs break-all">{drop.shareUrl}</p>
      </div>

      {drop.encrypted && !drop.passwordProtected && (
        <p className="bg-ember-soft text-ember-bright rounded-lg px-3 py-2 text-xs leading-relaxed">
          The decryption key lives in this link&apos;s <code>#fragment</code> and was never sent
          to the server. This is the only time you&apos;ll see it — copy it now.
        </p>
      )}
      {drop.passwordProtected && (
        <p className="bg-ember-soft text-ember-bright rounded-lg px-3 py-2 text-xs leading-relaxed">
          The recipient needs the passphrase to decrypt. Share it over a different channel than
          the link.
        </p>
      )}
      {!drop.encrypted && (
        <p className="bg-warn-soft text-warn rounded-lg px-3 py-2 text-xs">
          Stored without end-to-end encryption (WebCrypto unavailable).
        </p>
      )}

      <p className="text-ink-faint text-xs">
        Expires in {formatDuration(drop.ttlMs)} or after{" "}
        {drop.maxViews === 1 ? "one view" : `${drop.maxViews} views`}, whichever comes first.
      </p>

      <div className="flex items-center gap-2">
        <CopyButton text={drop.shareUrl} label="Copy link" variant="primary" size="md" />
        <Button size="md" variant="secondary" onClick={() => void toggleQr()} loading={qrLoading}>
          {qr ? "Hide QR" : "Show QR"}
        </Button>
        <Button size="md" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>

      {qr && (
        <div className="flex justify-center pt-2">
          {/* data: URL QR — next/image adds nothing here */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for the drop link" className="rounded-xl" />
        </div>
      )}
    </div>
  );
}
