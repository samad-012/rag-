"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  SendHorizontal, Loader2, Bot, FileUp, CheckCircle2, AlertCircle, Database, Sparkles 
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function LandingPage() {
  const [inputValue, setInputValue] = useState("");
  const [response, setResponse] = useState("");
  const [responseSource, setResponseSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    message: string; type: "success" | "error" | "loading" | null; fileName?: string; numChunks?: number;
  }>({ message: "", type: null });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset UI for new context
    setResponse("");
    setResponseSource("");
    setUploading(true);
    setUploadStatus({ message: "Vectorizing document...", type: "loading" });
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Server error during upload");
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setUploadStatus({ 
        message: "Knowledge base synchronized", 
        type: "success", 
        fileName: data.filename, 
        numChunks: data.num_chunks 
      });
    } catch (err: any) {
      setUploadStatus({ message: err.message || "Connection failed", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue || loading) return;

    setLoading(true);
    setResponse("");
    
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputValue }),
      });
      if (!res.ok) throw new Error("Chat request failed");

      const data = await res.json();
      setResponse(data.reply || data.error);
      setResponseSource(data.source || "general_chat");
      setInputValue("");
    } catch {
      setResponse("Connection Error: Is the FastAPI server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#030303] p-6 text-white overflow-hidden">
      <div className="absolute top-0 h-80 w-full bg-gradient-to-b from-blue-600/10 to-transparent opacity-60" />
      
      <div className="relative z-10 w-full max-w-2xl">
        <div className="text-center mb-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-500/5 text-blue-400 text-xs font-medium">
            <Sparkles size={14} /> <span>v1.3 Stable</span>
          </div>
          <h1 className="text-6xl font-black tracking-tighter">PROJECT <span className="text-blue-600">RAG</span></h1>
        </div>

        {/* Upload Interface */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} accept=".txt" />
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={uploading} 
            className="border-white/10 bg-zinc-900/50 hover:bg-zinc-800 h-12 px-6"
          >
            {uploading ? <Loader2 className="animate-spin mr-2" /> : <FileUp className="mr-2" />}
            {uploadStatus.fileName ? `Context: ${uploadStatus.fileName}` : "Upload Knowledge Base (.txt)"}
          </Button>

          {uploadStatus.message && (
            <div className="flex flex-col items-center gap-1 animate-in fade-in zoom-in">
              <div className={`text-xs flex items-center gap-2 ${
                uploadStatus.type === 'success' ? 'text-emerald-400' : 
                uploadStatus.type === 'error' ? 'text-red-400' : 'text-zinc-400'
              }`}>
                {uploadStatus.type === 'success' && <CheckCircle2 size={14}/>}
                {uploadStatus.type === 'error' && <AlertCircle size={14}/>}
                {uploadStatus.type === 'loading' && <Loader2 size={14} className="animate-spin"/>}
                {uploadStatus.message}
              </div>
              {uploadStatus.numChunks && (
                <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Database size={10} /> {uploadStatus.numChunks} context chunks indexed
                </div>
              )}
            </div>
          )}
        </div>

        {/* Query Interface */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-2 focus-within:border-blue-500/50 transition-all shadow-2xl">
            <div className="flex gap-2">
              <Input 
                value={inputValue} 
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={uploadStatus.type === 'success' ? "Query document or chat freely..." : "Chat freely or upload a file..."} 
                className="border-none bg-transparent focus-visible:ring-0 text-lg px-4"
              />
              <Button type="submit" disabled={loading || !inputValue} className="bg-blue-600 h-11 px-5 rounded-xl">
                {loading ? <Loader2 className="animate-spin" /> : <SendHorizontal size={20} />}
              </Button>
            </div>
          </div>
        </form>

        {/* Response Display */}
        {response && (
          <div className="mt-8 p-6 rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-start gap-4">
              <Bot className="text-blue-500 mt-1" size={28} />
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-blue-500/80 uppercase tracking-widest">
                  {responseSource === 'rag' ? 'Hybrid RAG Retrieval' : 'General Intelligence'}
                </p>
                <div className="text-zinc-200 text-lg leading-relaxed font-medium">{response}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}