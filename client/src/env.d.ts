/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPLOAD_NSEC?: string;
  readonly VITE_DEFAULT_RELAYS?: string;
  readonly VITE_UPLOAD_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
