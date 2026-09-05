import { useState, useEffect, useRef } from 'react';
import { getReviews, approveReview, deleteReview } from '../services/reviews/reviewService';
import { Star, Trash2, CheckCircle2, Clock, ThumbsUp } from 'lucide-react';
import { appToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { StatePanel, ToolbarSurface } from '../components/common/DashboardPrimitives';
import { ReviewCardsSkeleton, ReviewsSkeleton } from '../components/common/ReviewsSkeleton';

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
  const hasLoadedRef = useRef(false);

  // Fetch reviews from Supabase
  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await getReviews();
      setReviews(data as DBReview[] || []);
    } catch (err: unknown) {
      console.error('Error fetching reviews:', err);
      appToast.error('Failed to load reviews.');
    } finally {
      hasLoadedRef.current = true;
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
      
      appToast.success('Review approved successfully!');
      // Update local state
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'approved' } : r))
      );
    } catch (err: unknown) {
      console.error('Error approving review:', err);
      appToast.error('Failed to approve review.');
    } finally {
      setActioningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this review?')) return;
    setActioningId(id);
    try {
      await deleteReview(id);

      appToast.success('Review deleted permanently.');
      // Remove from local state
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      console.error('Error deleting review:', err);
      appToast.error('Failed to delete review.');
    } finally {
      setActioningId(null);
    }
  };

  // Filter reviews based on tabs
  const pendingReviews = reviews.filter((r) => r.status === 'pending');
  const approvedReviews = reviews.filter((r) => r.status === 'approved');
  const displayedReviews = activeTab === 'pending' ? pendingReviews : approvedReviews;

  if (loading && !hasLoadedRef.current) return <ReviewsSkeleton />;

  return (
    <div className="dashboard-page space-y-5">
      {/* Tabs / Filter Controls */}
      <ToolbarSurface className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="ui-tab-list table-scroll-region w-full sm:w-auto" role="tablist" aria-label="Review status">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pending'}
            onClick={() => setActiveTab('pending')}
            className={`ui-tab ${activeTab === 'pending' ? 'ui-tab-active' : ''}`}
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
            type="button"
            role="tab"
            aria-selected={activeTab === 'approved'}
            onClick={() => setActiveTab('approved')}
            className={`ui-tab ${activeTab === 'approved' ? 'ui-tab-active' : ''}`}
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
        
        <div className="px-1 text-xs text-muted-foreground font-mono">
          {displayedReviews.length} item{displayedReviews.length !== 1 && 's'} listed
        </div>
      </ToolbarSurface>

      {/* Loading state */}
      {loading ? (
        <ReviewCardsSkeleton />
      ) : displayedReviews.length === 0 ? (
        /* Empty State */
        <div className="ui-card"><StatePanel
          icon={activeTab === 'pending' ? Clock : Star}
          title={`No ${activeTab} reviews found`}
          description={activeTab === 'pending'
            ? 'New reviews submitted from the landing portal will appear here for validation.'
            : 'Approved reviews will display publicly on the landing portal.'}
        /></div>
      ) : (
        /* Reviews list */
        <div className="dashboard-auto-grid gap-4">
          {displayedReviews.map((review) => (
            <div
              key={review.id}
              className={`ui-card ui-card-interactive flex flex-col justify-between p-5 ${
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
                    className="ui-button-danger text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  {review.status === 'pending' && (
                    <button
                      onClick={() => handleApprove(review.id)}
                      disabled={actioningId === review.id}
                      className="ui-button bg-emerald-600 px-4 text-xs text-white shadow-sm hover:bg-emerald-700"
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
