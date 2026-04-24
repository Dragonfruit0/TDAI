
import React from 'react';

interface UIPreviewProps {
  html: string;
  isEditable?: boolean;
}

export const UIPreview: React.FC<UIPreviewProps> = ({ html, isEditable = false }) => {
  const srcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { margin: 0; padding: 0; overflow-x: hidden; background: #0f0f0f; color: white; min-height: 100vh; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #333; border-radius: 6px; }
          .editable-active { outline: 2px dashed #10b981; outline-offset: 2px; }
          .resizable-active { resize: both; overflow: auto; outline: 2px dashed #3b82f6; outline-offset: 2px; }
        </style>
      </head>
      <body>
        ${html}
        <script>
          const isEditable = ${isEditable};
          if (isEditable) {
            document.addEventListener('dblclick', function(e) {
              const target = e.target;
              if (target === document.body || target === document.documentElement) return;
              
              const isText = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'BUTTON', 'LI', 'LABEL'].includes(target.tagName);
              const isBlock = ['DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'IMG', 'VIDEO'].includes(target.tagName);

              if (isText) {
                target.contentEditable = "true";
                target.focus();
                target.classList.add('editable-active');
                
                target.addEventListener('blur', function() {
                  target.contentEditable = "false";
                  target.classList.remove('editable-active');
                  window.parent.postMessage({ type: 'UI_EDITED', html: document.body.innerHTML }, '*');
                }, { once: true });
              } else if (isBlock) {
                if (target.classList.contains('resizable-active')) {
                  target.classList.remove('resizable-active');
                  if (target._resizeObserver) {
                    target._resizeObserver.disconnect();
                    delete target._resizeObserver;
                  }
                  window.parent.postMessage({ type: 'UI_EDITED', html: document.body.innerHTML }, '*');
                } else {
                  target.classList.add('resizable-active');
                  const resizeObserver = new ResizeObserver(() => {
                    // We don't want to spam the parent with every pixel change, 
                    // but we need a way to know when they stop resizing.
                    // For now, we'll just let them toggle it off to save.
                  });
                  resizeObserver.observe(target);
                  target._resizeObserver = resizeObserver;
                }
              }
            });
          }
        </script>
      </body>
    </html>
  `;

  return (
    <div className="w-full h-full bg-[#0f0f0f] relative overflow-hidden">
      <iframe
        title="UI Preview"
        className="w-full h-full border-none"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
      />
    </div>
  );
};
