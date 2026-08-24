export type SelectedWorkRecord = {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
