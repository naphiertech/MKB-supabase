import { useState, useCallback, useMemo } from 'react';
import { checkHasActiveAttendance } from '../services/riders/riderAttendanceCheck';
import { ActiveShiftLogoutModal } from '../components/rider/ActiveShiftLogoutModal';

interface UseRiderSignOutOptions {
  riderId?: string;
  userId?: string;
  onSignOut?: () => void | Promise<void>;
}

export function useRiderSignOut({
  riderId,
  userId,
  onSignOut
}: UseRiderSignOutOptions) {
  const [isChecking, setIsChecking] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);

  const performSignOut = useCallback(async () => {
    if (!onSignOut) return;
    try {
      setIsSigningOut(true);
      await onSignOut();
    } finally {
      setIsSigningOut(false);
    }
  }, [onSignOut]);

  const requestSignOut = useCallback(async () => {
    if (isChecking || isSigningOut) return;
    if (!onSignOut) return;

    if (!riderId) {
      await performSignOut();
      return;
    }

    try {
      setIsChecking(true);
      const hasActive = await checkHasActiveAttendance(riderId, userId);
      if (hasActive) {
        setShowWarningModal(true);
      } else {
        await performSignOut();
      }
    } catch (err) {
      console.warn('[useRiderSignOut] Active shift check error, proceeding with standard sign out:', err);
      await performSignOut();
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, isSigningOut, onSignOut, performSignOut, riderId, userId]);

  const handleConfirmSignOut = useCallback(async () => {
    setShowWarningModal(false);
    await performSignOut();
  }, [performSignOut]);

  const handleCancelSignOut = useCallback(() => {
    setShowWarningModal(false);
  }, []);

  const warningModal = useMemo(() => (
    <ActiveShiftLogoutModal
      open={showWarningModal}
      onCancel={handleCancelSignOut}
      onConfirm={handleConfirmSignOut}
      isSigningOut={isSigningOut}
    />
  ), [showWarningModal, handleCancelSignOut, handleConfirmSignOut, isSigningOut]);

  return {
    requestSignOut,
    isChecking,
    isSigningOut,
    showWarningModal,
    warningModal
  };
}
