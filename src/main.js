import { history as editorHistory, historyKeymap, indentWithTab, defaultKeymap } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, bracketMatching, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { EditorView, drawSelection, dropCursor, highlightActiveLine, keymap } from '@codemirror/view';
import mermaid from 'mermaid';
import { createPreviewRendering } from './previewRendering.js';
import { createPreviewViewport } from './previewViewport.js';
import './styles.css';

const SOURCE_STORAGE_KEY = 'mermaid-source';
const RENDER_DELAY_MS = 350;

const DIAGRAM_TYPES = new Set([
  'architecture-beta',
  'block-beta',
  'c4context',
  'c4container',
  'classdiagram',
  'classdiagram-v2',
  'erdiagram',
  'flowchart',
  'gantt',
  'gitgraph',
  'graph',
  'journey',
  'mindmap',
  'packet-beta',
  'pie',
  'quadrantchart',
  'requirementdiagram',
  'sankey-beta',
  'sequencediagram',
  'statediagram',
  'statediagram-v2',
  'timeline',
  'xychart-beta',
]);

const MERMAID_KEYWORDS = new Set([
  'accdescr',
  'acctitle',
  'actor',
  'alt',
  'and',
  'as',
  'autonumber',
  'class',
  'classdef',
  'click',
  'critical',
  'direction',
  'else',
  'end',
  'loop',
  'note',
  'opt',
  'over',
  'par',
  'participant',
  'rect',
  'section',
  'style',
  'subgraph',
  'title',
]);

const sampleDiagram = `flowchart LR
  idea[Paste Mermaid] --> render{Valid syntax?}
  render -- yes --> svg[Preview SVG]
  render -- no --> error[Show parser error]
  svg --> export[Download if needed]`;

const mermaidLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.match(/\s*%%\{.*\}%%/)) return 'meta';
    if (stream.sol() && stream.match(/\s*%%.*/)) return 'comment';
    if (stream.eatSpace()) return null;
    if (stream.match(/(?:<-->|-->|==>|-\.->|-.->|---|--|==)/)) return 'operator';
    if (stream.match(/(?:`[^`]*`|"[^"]*"|'[^']*')/)) return 'string';
    if (stream.match(/\d+(?:\.\d+)?/)) return 'number';
    if (stream.match(/[{}[\]()]/)) return 'bracket';

    if (stream.match(/[A-Za-z][\w-]*/)) {
      const word = stream.current().toLowerCase();

      if (DIAGRAM_TYPES.has(word) || MERMAID_KEYWORDS.has(word)) {
        return 'keyword';
      }

      return null;
    }

    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: '%%' },
  },
});

const mermaidHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#0057b8', fontWeight: '700' },
  { tag: tags.operator, color: '#0f0f0f', fontWeight: '800' },
  { tag: tags.bracket, color: '#003f86' },
  { tag: tags.string, color: '#3f3f3b' },
  { tag: tags.number, color: '#003f86' },
  { tag: tags.comment, color: '#666660' },
  { tag: tags.meta, color: '#003f86', backgroundColor: 'rgba(0, 87, 184, 0.08)' },
]);

const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#ffffff',
      color: '#0f0f0f',
      height: '100%',
    },
    '&.cm-focused': {
      outline: '3px solid rgba(0, 87, 184, 0.22)',
      outlineOffset: '-3px',
    },
    '.cm-scroller': {
      fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: '0.95rem',
      lineHeight: '1.7',
    },
    '.cm-content': {
      minHeight: '100%',
      padding: '1rem',
    },
    '.cm-line': {
      padding: '0',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(0, 87, 184, 0.055)',
    },
    '.cm-cursor': {
      borderLeftColor: '#0f0f0f',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(0, 87, 184, 0.18)',
    },
    '.cm-placeholder': {
      color: '#666660',
    },
  },
  { dark: false },
);

const editorHost = document.querySelector('#editor');
const previewPanel = document.querySelector('#preview-panel');
const previewFrame = document.querySelector('#preview-frame');
const previewCanvas = document.querySelector('#preview-canvas');
const preview = document.querySelector('#preview');
const status = document.querySelector('#status');
const error = document.querySelector('#error');
const downloadButton = document.querySelector('#download-button');
const zoomOutButton = document.querySelector('#zoom-out');
const zoomResetButton = document.querySelector('#zoom-reset');
const zoomInButton = document.querySelector('#zoom-in');
const fullscreenButton = document.querySelector('#fullscreen-button');

let scheduledRenderId = null;

downloadButton.disabled = true;
fullscreenButton.disabled = !document.fullscreenEnabled;

const previewViewport = createPreviewViewport({
  frame: previewFrame,
  canvas: previewCanvas,
  readout: zoomResetButton,
  getDiagram: getRenderedDiagram,
});

const previewRendering = createPreviewRendering({
  mermaid,
  preview,
  error,
  viewport: previewViewport,
});

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  look: 'neo',
  theme: 'base',
  useMaxWidth: false,
  flowchart: {
    htmlLabels: true,
    useMaxWidth: false,
  },
  sequence: {
    mirrorActors: false,
    useMaxWidth: false,
  },
  themeVariables: {
    background: '#ffffff',
    darkMode: false,
    fontSize: '15px',
    textColor: '#111111',
    mainBkg: '#ffffff',
    nodeBorder: '#151515',
    primaryColor: '#ffffff',
    primaryTextColor: '#111111',
    primaryBorderColor: '#111111',
    lineColor: '#111111',
    secondaryColor: '#f5f5f2',
    secondaryTextColor: '#111111',
    secondaryBorderColor: '#151515',
    tertiaryColor: '#ffffff',
    tertiaryTextColor: '#111111',
    tertiaryBorderColor: '#0057b8',
    noteBkgColor: '#ffffff',
    noteTextColor: '#111111',
    noteBorderColor: '#0057b8',
    edgeLabelBackground: '#ffffff',
    clusterBkg: '#f7f7f4',
    clusterBorder: '#151515',
    actorBkg: '#ffffff',
    actorBorder: '#151515',
    actorTextColor: '#111111',
    actorLineColor: '#151515',
    signalColor: '#151515',
    signalTextColor: '#111111',
    labelBoxBkgColor: '#ffffff',
    labelBoxBorderColor: '#0057b8',
    labelTextColor: '#111111',
    loopTextColor: '#111111',
    activationBkgColor: '#f7f7f4',
    activationBorderColor: '#151515',
    bkgColorArray: ['#ffffff', '#f7f7f4'],
    borderColorArray: ['#151515', '#0057b8'],
    titleColor: '#111111',
    fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
});

const initialSource = localStorage.getItem(SOURCE_STORAGE_KEY) ?? sampleDiagram;
const editor = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: initialSource,
    extensions: [
      editorHistory(),
      drawSelection(),
      dropCursor(),
      bracketMatching(),
      highlightActiveLine(),
      indentUnit.of('  '),
      mermaidLanguage,
      syntaxHighlighting(mermaidHighlightStyle),
      editorTheme,
      EditorView.contentAttributes.of({ 'aria-label': 'Mermaid diagram source' }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;

        localStorage.setItem(SOURCE_STORAGE_KEY, getEditorValue());
        scheduleRender();
      }),
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run() {
            renderCurrentSource();
            return true;
          },
        },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
    ],
  }),
});

renderCurrentSource();

downloadButton.addEventListener('click', () => {
  previewRendering.downloadSvg();
});

zoomOutButton.addEventListener('click', previewViewport.zoomOut);
zoomInButton.addEventListener('click', previewViewport.zoomIn);
zoomResetButton.addEventListener('click', previewViewport.fit);

fullscreenButton.addEventListener('click', async () => {
  if (!document.fullscreenEnabled) return;

  try {
    if (document.fullscreenElement === previewPanel) {
      await document.exitFullscreen();
    } else {
      await previewPanel.requestFullscreen();
    }
  } catch (fullscreenError) {
    status.textContent = formatError(fullscreenError);
  }
});

document.addEventListener('fullscreenchange', updateFullscreenButton);

function scheduleRender() {
  status.textContent = 'Editing';
  previewRendering.invalidatePendingRender();
  clearScheduledRender();

  scheduledRenderId = window.setTimeout(() => {
    scheduledRenderId = null;
    renderCurrentSource();
  }, RENDER_DELAY_MS);
}

async function renderCurrentSource() {
  clearScheduledRender();
  status.textContent = 'Rendering';

  const result = await previewRendering.render(getEditorValue());

  if (result.state === 'stale') {
    return;
  }

  downloadButton.disabled = !previewRendering.hasSvg();

  if (result.state === 'empty') {
    status.textContent = 'Empty';
    return;
  }

  if (result.state === 'syntax-error') {
    status.textContent = 'Syntax error';
    return;
  }

  status.textContent = 'Rendered';
}

function getEditorValue() {
  return editor.state.doc.toString();
}

function getRenderedDiagram() {
  return preview.querySelector('svg');
}

function clearScheduledRender() {
  if (scheduledRenderId === null) return;

  window.clearTimeout(scheduledRenderId);
  scheduledRenderId = null;
}

function updateFullscreenButton() {
  fullscreenButton.textContent = document.fullscreenElement === previewPanel ? 'Exit' : 'Fullscreen';
}

function formatError(renderError) {
  return renderError?.str || renderError?.message || String(renderError);
}
