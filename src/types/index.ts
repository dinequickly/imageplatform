export interface MoodBoardItem {
  id: string;
  imageUrl: string;
  description?: string;
  name?: string; // New field for @mentioning
  isCurated: boolean;
  orderIndex?: number;
}

export interface Generation {
  id: string;
  prompt: string;
  imageA: string;
  imageB: string;
  selectedImage?: 'A' | 'B';
  explanation?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'text' | 'proposal' | 'image';
  imageUrl?: string; // For image messages
  proposal?: {
    prompt: string;
    status: 'pending' | 'accepted' | 'rejected';
    referenceImages?: string[]; // Changed to array
  };
}

export interface Profile {
    id: string;
    full_name?: string;
    company_name?: string;
    role?: string;
}

export interface FolderWithItems {
    id: string;
    name: string;
    items: MoodBoardItem[];
}


export interface Folder {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  user_id?: string;
}

export interface FolderItem {
  id: string;
  folder_id: string;
  image_url: string;
  title?: string;
  description?: string;
  created_at?: string;
}

export interface FolderWithItems extends Folder {
    items: MoodBoardItem[];
}
