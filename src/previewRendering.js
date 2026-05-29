export function createPreviewRendering({ mermaid, preview, error, viewport }) {
  let renderedSvg = '';
  let renderVersion = 0;
  let shouldFitNextRender = true;

  return {
    downloadSvg,
    hasSvg: () => Boolean(renderedSvg),
    invalidatePendingRender,
    render,
  };

  function invalidatePendingRender() {
    renderVersion += 1;
  }

  async function render(source) {
    const diagram = source.trim();
    const currentVersion = ++renderVersion;

    if (!diagram) {
      showEmptyState();
      return { state: 'empty' };
    }

    try {
      const { svg } = await mermaid.render(`diagram-${currentVersion}`, diagram);

      if (currentVersion !== renderVersion) {
        return { state: 'stale' };
      }

      renderedSvg = svg;
      preview.innerHTML = svg;
      viewport.normalizeSvgSize(getRenderedDiagram());
      error.hidden = true;
      await nextFrame();

      if (currentVersion !== renderVersion) {
        return { state: 'stale' };
      }

      if (shouldFitNextRender) {
        viewport.fit();
        shouldFitNextRender = false;
      }

      return { state: 'rendered', diagram };
    } catch (renderError) {
      if (currentVersion !== renderVersion) {
        return { state: 'stale' };
      }

      showErrorState(renderError);
      return { state: 'syntax-error' };
    }
  }

  function downloadSvg(filename = 'mermaid-diagram.svg') {
    if (!renderedSvg) return false;

    const blob = new Blob([renderedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  function showEmptyState() {
    renderedSvg = '';
    preview.innerHTML = '<span class="empty-state">Paste Mermaid code to begin.</span>';
    error.hidden = true;
    shouldFitNextRender = true;
    viewport.reset();
  }

  function showErrorState(renderError) {
    renderedSvg = '';
    preview.innerHTML = '<span class="empty-state">Fix the source to render a preview.</span>';
    error.hidden = false;
    error.textContent = formatError(renderError);
    shouldFitNextRender = true;
    viewport.reset();
  }

  function getRenderedDiagram() {
    return preview.querySelector('svg');
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function formatError(renderError) {
  return renderError?.str || renderError?.message || String(renderError);
}
