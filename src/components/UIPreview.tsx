
import React, { useEffect, useRef } from 'react';

interface UIPreviewProps {
  html: string;
  isEditable?: boolean;
}

export const UIPreview: React.FC<UIPreviewProps> = ({ html, isEditable = false }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Update HTML via postMessage for real-time feel if iframe is already loaded
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'UPDATE_HTML', html }, '*');
    }
  }, [html]);

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
          
          .edit-outline-hover { outline: 2px solid rgba(16, 185, 129, 0.4) !important; outline-offset: -2px !important; cursor: pointer !important; }
          .edit-outline-selected { outline: 2px solid #10b981 !important; outline-offset: -2px !important; }
          
          #edit-badge {
            position: fixed;
            z-index: 10000;
            background: #10b981;
            color: white;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            pointer-events: none;
            display: none;
            text-transform: lowercase;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          }
        </style>
      </head>
      <body>
        <div id="preview-container">
          ${html}
        </div>
        <div id="edit-badge"></div>
        <script>
          const isEditable = ${isEditable};
          const badge = document.getElementById('edit-badge');
          const container = document.getElementById('preview-container');
          let selectedElement = null;

          function setupInteractions() {
            if (isEditable) {
              document.body.style.cursor = 'crosshair';

              document.addEventListener('mouseover', function(e) {
                const target = e.target;
                if (target === document.body || target === document.documentElement || target === badge || target === container) return;
                if (!container.contains(target)) return;
                
                target.classList.add('edit-outline-hover');
                
                const rect = target.getBoundingClientRect();
                badge.textContent = target.tagName;
                badge.style.display = 'block';
                badge.style.top = (rect.top - 20 > 0 ? rect.top - 20 : rect.bottom + 5) + 'px';
                badge.style.left = rect.left + 'px';
              });

              document.addEventListener('mouseout', function(e) {
                const target = e.target;
                target.classList.remove('edit-outline-hover');
                badge.style.display = 'none';
              });

              document.addEventListener('click', function(e) {
                const target = e.target;
                if (target === document.body || target === document.documentElement || target === container) return;
                if (!container.contains(target)) return;
                
                e.preventDefault();
                e.stopPropagation();

                if (selectedElement) {
                  selectedElement.classList.remove('edit-outline-selected');
                  selectedElement.contentEditable = "false";
                }

                selectedElement = target;
                selectedElement.classList.add('edit-outline-selected');
                
                // Send class info to parent
                const rect = target.getBoundingClientRect();
                window.parent.postMessage({ 
                  type: 'ELEMENT_SELECTED', 
                  tagName: target.tagName,
                  classes: Array.from(target.classList).filter(c => !['edit-outline-hover', 'edit-outline-selected'].includes(c)).join(' '),
                  rect: {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                  }
                }, '*');

                const isText = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'BUTTON', 'LI', 'LABEL'].includes(target.tagName);
                
                if (isText) {
                  selectedElement.contentEditable = "true";
                  selectedElement.focus();
                }
              });

              document.addEventListener('input', function(e) {
                if (selectedElement && selectedElement.contains(e.target) || e.target === selectedElement) {
                  window.parent.postMessage({ type: 'UI_EDITED', html: container.innerHTML }, '*');
                }
              });

              document.addEventListener('blur', function(e) {
                if (e.target === selectedElement) {
                  selectedElement.classList.remove('edit-outline-selected');
                  selectedElement.contentEditable = "false";
                  selectedElement = null;
                  window.parent.postMessage({ type: 'UI_EDITED', html: container.innerHTML }, '*');
                }
              }, true);
            }
          }

          window.addEventListener('message', function(event) {
            if (event.data?.type === 'UPDATE_CLASSES' && selectedElement) {
              selectedElement.className = event.data.classes;
              selectedElement.classList.add('edit-outline-selected');
              window.parent.postMessage({ type: 'UI_EDITED', html: container.innerHTML }, '*');
            } else if (event.data?.type === 'UPDATE_HTML') {
              // Only update if content is actually different to avoid cycles
              if (container.innerHTML !== event.data.html) {
                container.innerHTML = event.data.html;
              }
            }
          });

          setupInteractions();
        </script>
      </body>
    </html>
  `;

  return (
    <div className="w-full h-full bg-[#0f0f0f] relative overflow-hidden">
      <iframe
        ref={iframeRef}
        title="UI Preview"
        className="w-full h-full border-none"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
      />
    </div>
  );
};

