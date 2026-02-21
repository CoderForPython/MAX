export interface User {
  id: number;
  username: string;
  avatar: string;
}

export interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  timestamp: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
