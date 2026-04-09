from fastapi import FastAPI, File, UploadFile
from pydantic import BaseModel
import os
import numpy as np
from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

load_dotenv()
api_key = os.getenv("HUGGINGFACE_API_KEY")

if not api_key:
    raise ValueError("HUGGINGFACE_API_KEY not found in .env")

app = FastAPI()

origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

client = InferenceClient(token=api_key)
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

document_store = {
    "filename": None,
    "chunks": [],
    "embeddings": [],
}

class ChatMessage(BaseModel):
    message: str

# --- Utility Routes ---
@app.get("/")
async def root():
    return {"message": "Project RAG backend is running"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "model_loaded": True}

# --- Core Logic ---
def split_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")
    chunks = []
    step = chunk_size - overlap
    for i in range(0, len(text), step):
        chunk = text[i:i + chunk_size]
        if chunk.strip():
            chunks.append(chunk)
    return chunks

def retrieve_relevant_chunks(query: str, top_k: int = 3):
    if not document_store["chunks"] or not document_store["embeddings"]:
        return [], 0.0

    query_embedding = embedding_model.encode(query, convert_to_numpy=True)
    chunk_embeddings = np.array(document_store["embeddings"])

    query_norm = np.linalg.norm(query_embedding)
    chunk_norms = np.linalg.norm(chunk_embeddings, axis=1)

    similarities = np.dot(chunk_embeddings, query_embedding) / (chunk_norms * query_norm + 1e-10)
    top_indices = np.argsort(similarities)[-top_k:][::-1]
    
    top_score = float(similarities[top_indices[0]]) if len(top_indices) > 0 else 0.0
    relevant_chunks = [document_store["chunks"][i] for i in top_indices]

    return relevant_chunks, top_score

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if not contents:
            return {"error": "Empty file"}

        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(contents)

        try:
            text = contents.decode("utf-8")
        except UnicodeDecodeError:
            text = contents.decode("latin-1")

        chunks = split_text(text)
        embeddings = embedding_model.encode(chunks, convert_to_numpy=True).tolist()

        document_store.update({
            "filename": file.filename,
            "chunks": chunks,
            "embeddings": embeddings,
        })

        return {"filename": file.filename, "num_chunks": len(chunks), "message": "Ready"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/chat")
async def chat(body: ChatMessage):
    try:
        query = body.message.strip()
        if not query: return {"error": "Empty message"}

        relevant_chunks, top_score = retrieve_relevant_chunks(query, top_k=3)
        THRESHOLD = 0.35 

        use_rag = document_store["chunks"] and top_score >= THRESHOLD
        
        # Refined system message
        system_content = (
            "You are a helpful AI assistant. Use the provided context to answer accurately."
        ) if use_rag else "You are a helpful AI assistant."

        context_text = "\n".join(relevant_chunks)
        user_content = (
            f"Context:\n{context_text}\n\nQuestion:\n{query}" 
            if use_rag else query
        )

        response = client.chat_completion(
            model="meta-llama/Llama-3.1-8B-Instruct",
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content}
            ],
            max_tokens=400,
            temperature=0.7
        )

        return {
            "reply": response.choices[0].message.content,
            "source": "rag" if use_rag else "general_chat",
            "similarity_score": round(top_score, 3)
        }
    except Exception as e:
        return {"error": str(e)}