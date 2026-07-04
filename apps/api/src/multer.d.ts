// Minimal ambient types for the multer bits we use (diskStorage), so we
// don't need the full @types/multer devDependency just for uploads.
declare module 'multer' {
  export interface StorageEngine {
    _handleFile: unknown;
    _removeFile: unknown;
  }

  interface MulterFile {
    fieldname: string;
    originalname: string;
    mimetype: string;
    size: number;
    filename: string;
    destination: string;
    path: string;
  }

  type FileNameCallback = (error: Error | null, filename: string) => void;
  type DestinationCallback = (error: Error | null, destination: string) => void;
  type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

  interface DiskStorageOptions {
    destination?:
      | string
      | ((req: unknown, file: MulterFile, cb: DestinationCallback) => void);
    filename?: (req: unknown, file: MulterFile, cb: FileNameCallback) => void;
  }

  export function diskStorage(options: DiskStorageOptions): StorageEngine;
}
