const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.2;
const WHEEL_ZOOM_SENSITIVITY = 0.0012;
const FIT_PADDING = 72;

export function createPreviewViewport({ frame, canvas, readout, getDiagram }) {
  let viewport = { scale: 1, x: 0, y: 0 };
  let dragState = null;

  frame.addEventListener('wheel', (event) => {
    event.preventDefault();
    const zoomFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
    setScale(viewport.scale * zoomFactor, { x: event.clientX, y: event.clientY });
  });

  frame.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    frame.setPointerCapture(event.pointerId);
    frame.classList.add('is-dragging');
  });

  frame.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    viewport.x = dragState.originX + event.clientX - dragState.startX;
    viewport.y = dragState.originY + event.clientY - dragState.startY;
    apply();
  });

  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);
  frame.addEventListener('dblclick', fit);

  apply();

  return {
    fit,
    normalizeSvgSize,
    reset,
    zoomIn: () => setScale(viewport.scale * ZOOM_STEP),
    zoomOut: () => setScale(viewport.scale / ZOOM_STEP),
  };

  function fit() {
    fitTo(getDiagram());
  }

  function fitTo(svg) {
    if (!svg) {
      reset();
      return;
    }

    const frameBounds = frame.getBoundingClientRect();
    const diagramBounds = getDiagramSize(svg);

    if (!frameBounds.width || !frameBounds.height || !diagramBounds.width || !diagramBounds.height) {
      reset();
      return;
    }

    const availableWidth = Math.max(frameBounds.width - FIT_PADDING, frameBounds.width * 0.5);
    const availableHeight = Math.max(frameBounds.height - FIT_PADDING, frameBounds.height * 0.5);
    const scale = clamp(
      Math.min(availableWidth / diagramBounds.width, availableHeight / diagramBounds.height),
      MIN_SCALE,
      MAX_SCALE,
    );

    viewport = { scale, x: 0, y: 0 };
    apply();
  }

  function setScale(nextScale, origin) {
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);

    if (origin) {
      const rect = frame.getBoundingClientRect();
      const originX = origin.x - rect.left - rect.width / 2;
      const originY = origin.y - rect.top - rect.height / 2;
      const localX = (originX - viewport.x) / viewport.scale;
      const localY = (originY - viewport.y) / viewport.scale;

      viewport.x = originX - localX * scale;
      viewport.y = originY - localY * scale;
    }

    viewport.scale = scale;
    apply();
  }

  function reset() {
    viewport = { scale: 1, x: 0, y: 0 };
    apply();
  }

  function apply() {
    canvas.style.transform = `translate(calc(-50% + ${viewport.x}px), calc(-50% + ${viewport.y}px)) scale(${viewport.scale})`;
    readout.textContent = `${Math.round(viewport.scale * 100)}%`;
  }

  function endDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (frame.hasPointerCapture(event.pointerId)) {
      frame.releasePointerCapture(event.pointerId);
    }

    frame.classList.remove('is-dragging');
    dragState = null;
  }
}

function normalizeSvgSize(svg) {
  if (!svg) return;

  const viewBox = svg.viewBox.baseVal;

  if (!viewBox?.width || !viewBox?.height) return;

  svg.removeAttribute('style');
  svg.setAttribute('width', String(viewBox.width));
  svg.setAttribute('height', String(viewBox.height));
  svg.style.width = `${viewBox.width}px`;
  svg.style.height = `${viewBox.height}px`;
  svg.style.maxWidth = 'none';
}

function getDiagramSize(svg) {
  const viewBox = svg.viewBox.baseVal;

  if (viewBox?.width && viewBox?.height) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const bounds = svg.getBBox();

  if (bounds.width && bounds.height) {
    return { width: bounds.width, height: bounds.height };
  }

  const rect = svg.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
