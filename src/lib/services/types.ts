export type ServiceRecord = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_min: number;
  duration_max: number | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
