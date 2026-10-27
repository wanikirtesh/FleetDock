import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  FileCode, 
  Copy, 
  Check, 
  Download, 
  Layers, 
  ShieldCheck, 
  ExternalLink,
  BookOpen,
  ArrowRight,
  Server,
  Activity,
  Archive,
  RefreshCw,
  FolderGit2,
  Database,
  UploadCloud,
  CheckCircle2,
  Plus
} from 'lucide-react';
import JSZip from 'jszip';
import { SPRING_BOOT_FILES, SpringBootFile } from '../../data/springBootCode';
import { useFleet } from '../../context/FleetContext';

export const SpringBootViewer: React.FC = () => {
  const {
    vms,
    backendUrl,
    setBackendUrl,
    isBackendConnected,
    isSyncing,
    backendEngineInfo,
    connectToBackend,
    seedBackendDatabase,
    fetchFromBackend,
    dataSource,
    setDataSource,
    setIsAddVmModalOpen,
  } = useFleet();

  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [customBackendUrl, setCustomBackendUrl] = useState(backendUrl || 'http://localhost:8080');

  const currentFile = SPRING_BOOT_FILES[activeFileIndex];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSingleFile = () => {
    const blob = new Blob([currentFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download entire runnable Spring Boot repository as a ZIP archive
  const handleDownloadFullZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const rootFolder = zip.folder('fleetdock-spring-boot-backend');

      SPRING_BOOT_FILES.forEach((f) => {
        rootFolder?.file(f.path, f.content);
      });

      rootFolder?.file('README.md', `# FleetDock - Spring Boot 3 Java Backend\n\nRun with:\n\`mvn clean spring-boot:run\` or \`docker compose up --build\``);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fleetdock-spring-boot-backend.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating zip:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const handleConnectAndSync = async () => {
    await connectToBackend(customBackendUrl.trim());
  };

  const endpoints = [
    { method: 'GET', path: '/api/v1/health', desc: 'Healthcheck, engine version, and uptime' },
    { method: 'POST', path: '/api/v1/hosts/register', desc: 'Registers new VM with encrypted SSH/TLS/Agent credentials in DB' },
    { method: 'GET', path: '/api/v1/hosts', desc: 'Returns all registered VMs and their health status' },
    { method: 'POST', path: '/api/v1/hosts/{id}/ping', desc: 'Tests live connection handshake and returns latency in ms' },
    { method: 'GET', path: '/api/v1/hosts/{id}/containers', desc: 'Queries remote Docker engine for all running/stopped containers' },
    { method: 'POST', path: '/api/v1/hosts/{id}/containers/{cid}/start', desc: 'Sends Docker start container command' },
    { method: 'POST', path: '/api/v1/hosts/{id}/containers/{cid}/stop', desc: 'Sends SIGTERM (15) graceful stop with timeout' },
    { method: 'GET', path: '/api/v1/hosts/{id}/containers/{cid}/logs', desc: 'Server-Sent Events (SSE) streaming real-time stdout/stderr' },
    { method: 'PUT', path: '/api/v1/hosts/{id}/compose/{sid}/variables', desc: 'Updates .env compose variables with encrypted secrets' },
  ];

  return (
    <div className="space-y-6">
      
      {/* Intro Header */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/40 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">
                  Java Spring Boot 3 Backend
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Java 21 • Spring Boot 3.3.4 • Docker-Java 3.4.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Full-stack implementation featuring encrypted credential storage, SSH tunnel multiplexing, and Docker Engine REST & SSE APIs.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied File' : 'Copy File'}</span>
            </button>

            <button
              onClick={handleDownloadSingleFile}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{currentFile.filename}</span>
            </button>

            <button
              onClick={handleDownloadFullZip}
              disabled={isZipping}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-900/30 disabled:opacity-50"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{isZipping ? 'Generating ZIP...' : 'Download Full Project (.zip)'}</span>
            </button>
          </div>
        </div>

        {/* Live Backend Connection & Real DB Sync Controller */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className={`w-3 h-3 rounded-full ${isBackendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <div>
                <span className="font-semibold text-slate-200">
                  Spring Boot Backend: <span className={isBackendConnected ? 'text-emerald-400' : 'text-amber-400'}>{isBackendConnected ? 'CONNECTED & SYNCED' : 'STANDALONE DEMO'}</span>
                </span>
                <span className="text-slate-400 font-mono text-[11px] ml-2 block sm:inline">
                  {backendEngineInfo} • {vms.length} Hosts in UI
                </span>
              </div>
            </div>

            {/* Target Spring Boot URL & Connect Button */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                value={customBackendUrl}
                onChange={(e) => setCustomBackendUrl(e.target.value)}
                placeholder="http://localhost:8080"
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500 w-full md:w-64"
              />
              <button
                onClick={handleConnectAndSync}
                disabled={isSyncing}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Connect & Sync DB'}</span>
              </button>
            </div>
          </div>

          {/* Database Operations Bar */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>
                Active Database: <strong className="text-slate-200">{dataSource === 'spring_boot' ? 'Spring Boot REST API (PostgreSQL/H2)' : 'In-Memory Demo'}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => seedBackendDatabase()}
                disabled={isSyncing}
                className="px-2.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Populate your local Spring Boot database (H2/PostgreSQL) with initial VM records via POST /api/v1/hosts/register"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Seed Spring Boot DB with Hosts</span>
              </button>

              <button
                onClick={() => setIsAddVmModalOpen(true)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                <span>Register VM in DB</span>
              </button>

              <button
                onClick={() => setDataSource(dataSource === 'spring_boot' ? 'mock' : 'spring_boot')}
                className="px-2.5 py-1 rounded text-slate-400 hover:text-slate-200 underline text-[11px]"
              >
                Switch to {dataSource === 'spring_boot' ? 'Demo Mode' : 'Live Mode'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Code Browser & Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Left: File Tree */}
        <div className="lg:col-span-1 rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 font-mono flex items-center justify-between">
            <span>Project Explorer</span>
            <span className="text-slate-500">{SPRING_BOOT_FILES.length} Files</span>
          </div>

          <div className="space-y-1">
            {SPRING_BOOT_FILES.map((file, idx) => {
              const isActive = activeFileIndex === idx;
              return (
                <button
                  key={file.filename}
                  onClick={() => setActiveFileIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all flex items-center justify-between ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span className="truncate">{file.filename}</span>
                  </div>
                  <span className="text-[10px] text-slate-600 uppercase">{file.language}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-800 px-2 text-[11px] text-slate-500 space-y-1">
            <p>Run locally with Maven:</p>
            <code className="text-cyan-400 block font-mono text-[10px] bg-slate-950 p-1.5 rounded">
              mvn clean spring-boot:run
            </code>
          </div>
        </div>

        {/* Right: Code Viewer */}
        <div className="lg:col-span-3 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col">
          
          <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs text-slate-200">
                <span className="text-cyan-400">{currentFile.path}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {currentFile.description}
              </p>
            </div>

            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Copy code"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Syntax Highlighted Code block */}
          <div className="p-4 bg-slate-950 overflow-x-auto text-xs font-mono leading-relaxed select-text flex-1 max-h-[550px]">
            <pre className="text-slate-300">
              <code>{currentFile.content}</code>
            </pre>
          </div>

        </div>

      </div>

      {/* Spring Boot REST API Endpoint Reference */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <BookOpen className="w-4 h-4 text-indigo-400" />
          <span>Spring Boot REST & SSE API Reference</span>
        </div>

        <div className="rounded-lg border border-slate-800 overflow-hidden font-mono text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] uppercase">
              <tr>
                <th className="p-2.5 w-24">Method</th>
                <th className="p-2.5">Endpoint URL</th>
                <th className="p-2.5">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {endpoints.map((ep, idx) => (
                <tr key={idx} className="hover:bg-slate-950/40">
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      ep.method === 'POST'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : ep.method === 'GET'
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {ep.method}
                    </span>
                  </td>
                  <td className="p-2.5 text-cyan-300 font-semibold">{ep.path}</td>
                  <td className="p-2.5 text-slate-400 font-sans text-xs">{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
