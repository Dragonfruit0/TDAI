import React, { useEffect, useRef } from 'react';

interface UIPreviewProps {
  html: string;
  isEditable?: boolean;
}

export const UIPreview: React.FC<UIPreviewProps> = ({ html, isEditable = false }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Safe helper to sync data once the iframe finishes mounting/loading
  const handleIframeLoad = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'UPDATE_HTML', html }, '*');
      iframeRef.current.contentWindow.postMessage({ type: 'SET_EDIT_MODE', isEditable }, '*');
    }
  };

  // Sync HTML updates dynamically
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'UPDATE_HTML', html }, '*');
    }
  }, [html]);

  // Sync editable state toggles
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'SET_EDIT_MODE', isEditable }, '*');
    }
  }, [isEditable]);

  // We keep the srcDoc completely state-neutral & static so the iframe never reloads on changes.
  // This solves the dynamic frame reloading, screen flashing, and text focus jumping glitches.
  const srcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            overflow-x: hidden; 
            background: #0f0f0f; 
            color: white; 
            min-height: 100vh; 
            transition: background-color 0.2s ease;
          }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #333; border-radius: 6px; }
          
          .edit-outline-hover { 
            outline: 2px dashed rgba(16, 185, 129, 0.4) !important; 
            outline-offset: -2px !important; 
            cursor: pointer !important; 
          }
          .edit-outline-selected { 
            outline: 2px solid #10b981 !important; 
            outline-offset: -2px !important; 
          }
          
          #edit-badge {
            position: fixed;
            z-index: 10000;
            background: #10b981;
            color: white;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
        <div id="preview-container"></div>
        <div id="edit-badge"></div>
        
        <script>
          let isEditable = false;
          const badge = document.getElementById('edit-badge');
          const container = document.getElementById('preview-container');
          let selectedElement = null;

          function setupInteractions() {
            document.body.style.cursor = 'default';

            document.addEventListener('mouseover', function(e) {
              if (!isEditable) return;
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
              if (!isEditable) return;
              const target = e.target;
              target.classList.remove('edit-outline-hover');
              badge.style.display = 'none';
            });

            document.addEventListener('click', function(e) {
              if (!isEditable) return;
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
              
              const rect = target.getBoundingClientRect();
              
              // Post element details up to the parent sidebar editor
              window.parent.postMessage({ 
                type: 'ELEMENT_SELECTED', 
                tagName: target.tagName,
                classes: Array.from(target.classList).filter(c => !['edit-outline-hover', 'edit-outline-selected'].includes(c)).join(' '),
                textContent: target.textContent ? target.textContent.trim() : '',
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

            // Handle inline contentEditable changes safely
            document.addEventListener('input', function(e) {
              if (!isEditable) return;
              if (selectedElement && (selectedElement.contains(e.target) || e.target === selectedElement)) {
                
                // Let the parent know about the text change
                window.parent.postMessage({
                  type: 'ELEMENT_TEXT_EDITED',
                  textContent: selectedElement.textContent ? selectedElement.textContent.trim() : ''
                }, '*');

                // Send updated bundle
                window.parent.postMessage({ type: 'UI_EDITED', html: container.innerHTML }, '*');
              }
            });

            document.addEventListener('blur', function(e) {
              if (!isEditable) return;
              if (e.target === selectedElement) {
                // Keep the selection outline visual but lock contentEditable
                selectedElement.contentEditable = "false";
                window.parent.postMessage({ type: 'UI_EDITED', html: container.innerHTML }, '*');
              }
            }, true);
          }

          window.addEventListener('message', function(event) {
            // Verify message is coming from the parent window
            if (event.source !== window.parent) return;

            if (event.data?.type === 'SET_EDIT_MODE') {
              isEditable = event.data.isEditable;
              if (!isEditable) {
                document.body.style.cursor = 'default';
                if (selectedElement) {
                  selectedElement.classList.remove('edit-outline-selected');
                  selectedElement.contentEditable = "false";
                  selectedElement = null;
                }
                document.querySelectorAll('.edit-outline-hover').forEach(el => {
                  el.classList.remove('edit-outline-hover');
                });
                badge.style.display = 'none';
              } else {
                document.body.style.cursor = 'crosshair';
              }
            } else if (event.data?.type === 'UPDATE_CLASSES') {
              let el = selectedElement;
              if (!el || !container.contains(el)) {
                el = container.querySelector('.edit-outline-selected') || container.querySelector('.edit-outline-hover');
              }
              if (el) {
                selectedElement = el;
                el.className = event.data.classes;
                el.classList.add('edit-outline-selected');
                window.parent.postMessage({ type: 'UI_EDITED', html: container.innerHTML }, '*');
              }
            } else if (event.data?.type === 'UPDATE_TEXT') {
              let el = selectedElement;
              if (!el || !container.contains(el)) {
                el = container.querySelector('.edit-outline-selected') || container.querySelector('.edit-outline-hover');
              }
              if (el) {
                selectedElement = el;
                el.textContent = event.data.text;
                window.parent.postMessage({ type: 'UI_EDITED', html: container.innerHTML }, '*');
              }
            } else if (event.data?.type === 'UPDATE_HTML') {
              // Ignore updates from the parent if the user is typing to prevent focus-caret reset loops!
              if (document.activeElement && document.activeElement.contentEditable === "true") {
                return;
              }
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
        id="ui-preview-iframe"
        title="UI Preview"
        className="w-full h-full border-none"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        onLoad={handleIframeLoad}
      />
    </div>
  );
};
