import { supabase } from '../../lib/supabaseClient';

export interface ReviewRow {
  id: string;
  name: string;
  role_title: string | null;
  rating: number;
  comment: string | null;
  status: 'pending' | 'approved';
  created_at: string;
  [key: string]: unknown;
}

// Fetch all reviews
export const getReviews = async (): Promise<ReviewRow[]> => {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

// Approve a review by marking status as 'approved'
export const approveReview = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('reviews')
    .update({ status: 'approved' })
    .eq('id', id);

  if (error) throw error;
};

// Delete a review permanently
export const deleteReview = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', id);

  if (error) throw error;
};
