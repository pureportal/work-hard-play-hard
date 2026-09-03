export interface AvatarReference {
  userId: string;
  version: string;
}

export interface StoredAvatar extends AvatarReference {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
}

export interface AvatarWrite {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
}
