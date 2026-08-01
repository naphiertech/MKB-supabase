import { useState, useEffect } from 'react';
import { getReviews, approveReview, deleteReview } from '../services/reviewService';
import { Star, Trash2, CheckCircle2, Clock, MessageSquare, ThumbsUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

interface DBReview {
  id: string;
  name: string;
  role_title: string | null;
  rating: number;
  comment: string;
  status: 'pending' | 'approved';
  created_at: string;
}

export function ReviewsModeration() {
  const { session } = useAuth();
  const currentUserRole = session?.role;
  const isHR = currentUserRole === 'hr';

  const [reviews, setReviews] = useState<DBReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Fetch reviews from Supabase
  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await getReviews();
      setReviews(data as DBReview[] || []);
    } catch (err: unknown) {
      console.error('Error fetching reviews:', err);
      toast.error('Failed to load reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleApprove = async (id: string) => {
    setActioningId(id);
    try {
      await approveReview(id);
      
      toast.success('Review approved successfully!');
      // Update local state
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'approved' } : r))
      );
    } catch (err: unknown) {
      console.error('Error approving review:', err);
      toast.error('Failed to approve review.');
    } finally {
      setActioningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this review?')) return;
    setActioningId(id);
    try {
      await deleteReview(id);

      toast.success('Review deleted permanently.');
      // Remove from local state
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      console.error('Error deleting review:', err);
      toast.error('Failed to delete review.');
    } finally {
      setActioningId(null);
    }
  };

  // Filter reviews based on tabs
  const pendingReviews = reviews.filter((r) => r.status === 'pending');
  const approvedReviews = reviews.filter((r) => r.status === 'approved');
  const displayedReviews = activeTab === 'pending' ? pendingReviews : approvedReviews;

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            {isHR ? 'Rider Performance Feedback' : 'Customer Reviews Moderation'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isHR 
              ? 'View submitted customer reviews and rider performance feedback.' 
              : 'Moderate submitted customer reviews before they are displayed publicly on the landing page.'}
          </p>
        </div>
      </div>

      {/* Tabs / Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-2 rounded-xl border border-border shadow-xs">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-accent text-primary border border-primary/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-panel-bg border border-transparent'
            }`}
          >
            <Clock className="w-4 h-4" />
            Pending Verification
            {pendingReviews.length > 0 && (
              <span className="ml-1 bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {pendingReviews.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'approved'
                ? 'bg-accent text-primary border border-primary/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-panel-bg border border-transparent'
            }`}
          >
            <ThumbsUp className="w-4 h-4" />
            Approved Publicly
            {approvedReviews.length > 0 && (
              <span className="ml-1 bg-muted-foreground text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {approvedReviews.length}
              </span>
            )}
          </button>
        </div>
        
        <div className="text-xs text-muted-foreground font-mono pr-2">
          {displayedReviews.length} item{displayedReviews.length !== 1 && 's'} listed
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-border rounded-2xl space-y-4">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Fetching reviews...</p>
        </div>
      ) : displayedReviews.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-border rounded-2xl text-center px-4">
          <div className="w-14 h-14 bg-panel-bg rounded-full flex items-center justify-center border border-border text-muted-foreground mb-4">
            {activeTab === 'pending' ? <Clock className="w-6 h-6" /> : <Star className="w-6 h-6" />}
          </div>
          <h3 className="text-base font-semibold text-foreground">
            No {activeTab} reviews found
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            {activeTab === 'pending'
              ? 'New reviews submitted from the landing portal will appear here for validation.'
              : 'Approved reviews will display publicly on the landing portal.'}
          </p>
        </div>
      ) : (
        /* Reviews list */
        <div className="grid gap-4 md:grid-cols-2">
          {displayedReviews.map((review) => (
            <div
              key={review.id}
              className={`bg-white border p-5 rounded-2xl shadow-sm flex flex-col justify-between transition-all duration-200 ${
                review.status === 'pending' ? 'border-border hover:border-primary/30' : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <div>
                {/* Author information & Date */}
                <div className="flex justify-between items-start gap-4 mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground text-base leading-snug">{review.name}</h3>
                    {review.role_title ? (
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">{review.role_title}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic mt-0.5">Verified Customer</p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono bg-panel-bg border border-border px-2 py-0.5 rounded-md">
                    {new Date(review.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                {/* Star rating */}
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < review.rating ? 'fill-primary text-primary' : 'text-gray-200'
                      }`}
                    />
                  ))}
                </div>

                {/* Comment */}
                <blockquote className="text-sm text-foreground leading-relaxed italic bg-panel-bg/50 border-l-2 border-primary/20 pl-3 py-1 mb-4">
                  "{review.comment}"
                </blockquote>
              </div>

              {/* Action buttons */}
              {!isHR && (
                <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3 mt-auto">
                  <button
                    onClick={() => handleDelete(review.id)}
                    disabled={actioningId === review.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  {review.status === 'pending' && (
                    <button
                      onClick={() => handleApprove(review.id)}
                      disabled={actioningId === review.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
