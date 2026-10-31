import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, subtitle, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={onClose} onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }} aria-label={title}>
      <div className="modal-inner">
        <header className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}
