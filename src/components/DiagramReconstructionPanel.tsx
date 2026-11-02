import React, { useEffect, useMemo, useRef, useState } from 'react';
import { extractChatGptArtifacts } from '../diagrams/artifacts';
import { applyReconstructions, canReconstructArtifact, DEFAULT_RECONSTRUCTION_MODEL, discoverReconstructionModels, reconstructArtifact, type ReconstructionProvider } from '../services/diagramReconstruction';

interface Props {
  content: string;
  onReplace: (expected: string, replacement: string) => void;
}

/** Recovery is explicitly requested; typing and preview never call a model. */
const DiagramReconstructionPanel: React.FC<Props> = ({ content, onReplace }) => {
  const artifacts = useMemo(() => extractChatGptArtifacts(content), [content]);
  const eligible = artifacts.filter(canReconstructArtifact);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<ReconstructionProvider>('openai');
  const [model, setModel] = useState('');
  const [geminiModel, setGeminiModel] = useState(DEFAULT_RECONSTRUCTION_MODEL);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<{ original: string; reconstructed: string } | null>(null);
  const operation = useRef<{ snapshot: string; controller: AbortController } | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => () => operation.current?.controller.abort(), []);
  useEffect(() => {
    if (operation.current && operation.current.snapshot !== content) {
      operation.current.controller.abort();
      setError('Document changed. Reconstruction was cancelled so your edits are preserved.');
    }
  }, [content]);

  const reconstruct = async () => {
    if (operation.current || !eligible.length || (provider === 'gemini' && !apiKey.trim())) return;
    const snapshot = contentRef.current;
    const job = { snapshot, controller: new AbortController() };
    operation.current = job;
    setError('');
    setMessage('');
    setProgress('Starting reconstruction…');
    try {
      let selectedModel = provider === 'gemini' ? geminiModel.trim() : model.trim();
      if (provider === 'openai' && !selectedModel) {
        setProgress('Finding available reconstruction models…');
        selectedModel = (await discoverReconstructionModels({ signal: job.controller.signal }))[0];
        setModel(selectedModel);
      }
      const charts: string[] = [];
      for (let index = 0; index < eligible.length; index++) {
        setProgress(`Reconstructing diagram ${index + 1} of ${eligible.length}…`);
        charts.push(await reconstructArtifact(eligible[index], apiKey, { signal: job.controller.signal, model: selectedModel, provider }));
      }
      if (job.controller.signal.aborted) return;
      if (contentRef.current !== snapshot) {
        setError('Document changed. Reconstruction was not applied; your edits are preserved.');
        return;
      }
      const reconstructed = applyReconstructions(snapshot, eligible, charts);
      setUndo({ original: snapshot, reconstructed });
      onReplace(snapshot, reconstructed);
      setMessage(`Reconstructed ${eligible.length} diagram${eligible.length === 1 ? '' : 's'}. Review the inferred connections in the preview or edit the Mermaid source.`);
    } catch (err) {
      if (contentRef.current !== snapshot) setError('Document changed. Reconstruction was cancelled so your edits are preserved.');
      else if (err instanceof Error && err.name === 'AbortError') setMessage('Reconstruction cancelled. Your original copy is unchanged.');
      else setError(err instanceof Error ? err.message : 'Reconstruction failed. Try again.');
    } finally {
      if (operation.current === job) {
        operation.current = null;
        setProgress(null);
      }
    }
  };

  if (!artifacts.length && !undo && !progress && !message && !error && !apiKey) return null;

  return <section aria-label="Diagram reconstruction" className="shrink-0 border-b border-docit-border bg-docit-surface p-3 text-xs text-docit-text print:hidden">
    {!!eligible.length && <>
      <p className="mb-2">This copy lost its arrows. Reconstruct sends nearby text and labels to {provider === 'gemini' ? 'Gemini' : 'the configured AI service'} to infer connections; the result needs review.</p>
      <label className="block mb-2">Reconstruction provider
        <select aria-label="Reconstruction provider" value={provider} onChange={event => setProvider(event.target.value as ReconstructionProvider)} disabled={!!progress}
          className="ml-2 rounded border border-docit-border bg-docit-bg px-2 py-1">
          <option value="openai">Configured AI service</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2 items-end">
        {provider === 'gemini' ? <label className="flex-1 min-w-36">
          <span className="block mb-1">Gemini API key (this session only)</span>
          <input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} disabled={!!progress}
            autoComplete="off" spellCheck={false} className="w-full rounded border border-docit-border bg-docit-bg px-2 py-1.5" />
        </label> : <p className="flex-1">Uses the service configured for this app. An available model is selected when you reconstruct.</p>}
        <button type="button" onClick={reconstruct} disabled={!!progress || (provider === 'gemini' && !apiKey.trim())}
          className="rounded border border-docit-accent bg-docit-accent-subtle px-3 py-1.5 disabled:opacity-50">Reconstruct diagrams</button>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer">Model settings</summary>
        <label className="mt-2 block">{provider === 'gemini' ? 'Gemini model' : 'AI model ID (optional)'}
          <input value={provider === 'gemini' ? geminiModel : model} onChange={event => provider === 'gemini' ? setGeminiModel(event.target.value) : setModel(event.target.value)} disabled={!!progress} autoComplete="off" spellCheck={false}
            placeholder={provider === 'openai' ? 'Automatic model discovery' : undefined}
            className="ml-2 rounded border border-docit-border bg-docit-bg px-2 py-1" />
        </label>
      </details>
    </>}
    {artifacts.length > eligible.length && <p className="mt-2">{artifacts.length - eligible.length} diagram copy/copies cannot be reconstructed as flowcharts. Paste their Mermaid source or rendered SVG.</p>}
    {progress && <div className="mt-2 flex gap-3"><p role="status">{progress}</p><button type="button" className="underline" onClick={() => operation.current?.controller.abort()}>Cancel reconstruction</button></div>}
    {error && <p role="alert" className="mt-2">{error}</p>}
    {message && <p role="status" className="mt-2">{message}</p>}
    {apiKey && <button type="button" disabled={!!progress} onClick={() => setApiKey('')} className="underline px-1 py-1.5 disabled:opacity-50">Clear key</button>}
    {undo && <div className="mt-2">
      <button type="button" disabled={!!progress || content !== undo.reconstructed}
        className="underline disabled:opacity-50" onClick={() => {
          onReplace(undo.reconstructed, undo.original);
          setUndo(null);
          setMessage('Original copy restored.');
          setError('');
        }}>Undo reconstruction</button>
      {content !== undo.reconstructed && <span className="ml-2">Undo is unavailable after further edits.</span>}
    </div>}
  </section>;
};

export default DiagramReconstructionPanel;
