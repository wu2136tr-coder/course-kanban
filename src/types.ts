export interface Task {
  id: string;
  text: string;
  status: 0 | 1 | 2; // 0 = 待辦, 1 = 進行中, 2 = 完成
  createdAt: string;
}

export interface Consultation {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}
