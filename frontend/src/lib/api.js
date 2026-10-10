import { useEffect, useRef, useState } from "react";

// In development Vite proxies /api to the FastAPI server; in the built
// app FastAPI serves both, so a relative path works in both cases.
const BASE = "/api";

function buildUrl(path, params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const text = query.toString();
  return `${BASE}${path}${text ? `?${text}` : ""}`;
}

async function getJson(path, params, signal) {
  let response;
  try {
    response = await fetch(buildUrl(path, params), { signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Can't reach the backend. Start it from the backend folder with: python -m uvicorn app.main:app --port 8010"
    );
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep the generic message */
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Fetch JSON whenever `path` or `params` change.
 * While a new request is in flight the previous data stays on screen
 * (`refreshing` is true), so charts never flash empty.
 * Pass `path = null` to skip fetching.
 */
export function useApi(path, params) {
  const key = path ? buildUrl(path, params) : null;
  const [state, setState] = useState({ data: null, error: null, loadedKey: null });
  const latest = useRef(key);
  latest.current = key;

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    getJson(path, params, controller.signal)
      .then((data) => {
        if (latest.current === key) setState({ data, error: null, loadedKey: key });
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        if (latest.current === key) setState({ data: null, error, loadedKey: key });
      });
    return () => controller.abort();
    // `key` already encodes path and params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { data: null, error: null, loading: false, refreshing: false };
  const settled = state.loadedKey === key;
  return {
    data: state.data,
    error: settled ? state.error : null,
    loading: !settled && !state.data,
    refreshing: !settled && !!state.data,
  };
}
