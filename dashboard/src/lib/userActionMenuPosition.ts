export interface ActionMenuPosition {
  left: number;
  placement: 'down' | 'up';
  top: number;
}

export function calculateUserActionMenuPosition(
  trigger: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 4,
  margin = 8
): ActionMenuPosition {
  const spaceBelow = viewport.height - trigger.bottom - margin;
  const spaceAbove = trigger.top - margin;
  const placement = spaceBelow >= menu.height || spaceBelow >= spaceAbove ? 'down' : 'up';
  const desiredTop = placement === 'down' ? trigger.bottom + gap : trigger.top - menu.height - gap;

  return {
    placement,
    top: Math.min(Math.max(margin, desiredTop), Math.max(margin, viewport.height - menu.height - margin)),
    left: Math.min(Math.max(margin, trigger.right - menu.width), Math.max(margin, viewport.width - menu.width - margin)),
  };
}
