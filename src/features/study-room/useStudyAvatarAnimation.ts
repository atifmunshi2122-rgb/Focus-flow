/**
 * FocusFlow & Finance — Study Avatar Animation Hook
 *
 * Manages smooth cross-faded looping activity animations and temporary one-shot
 * celebration/emote animations that automatically return to the previous activity.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { AnimationAction } from 'three';
import type { AvatarEmote, StudyActivity } from './types.ts';
import { findAnimation, findEmoteAnimation } from './animation-map.ts';

interface UseStudyAvatarAnimationProps {
  actions: Record<string, AnimationAction | null>;
  names: string[];
  activity: StudyActivity;
  preferredAnimation?: string;
  activeEmote?: AvatarEmote | null;
  preferredEmoteAnimation?: string;
  enabled?: boolean;
}

export function useStudyAvatarAnimation({
  actions,
  names,
  activity,
  preferredAnimation,
  activeEmote = null,
  preferredEmoteAnimation,
  enabled = true,
}: UseStudyAvatarAnimationProps) {
  const currentAction = useRef<AnimationAction | null>(null);

  const animationName = useMemo(
    () => (enabled ? findAnimation(names, activity, preferredAnimation) : undefined),
    [enabled, names, activity, preferredAnimation]
  );

  const emoteAnimationName = useMemo(
    () => (enabled && activeEmote ? findEmoteAnimation(names, activeEmote, preferredEmoteAnimation) : undefined),
    [enabled, names, activeEmote, preferredEmoteAnimation]
  );

  const targetClipName = enabled ? emoteAnimationName || animationName : undefined;

  useEffect(() => {
    if (!enabled || !targetClipName) {
      if (currentAction.current) {
        currentAction.current.stop();
        currentAction.current = null;
      }
      return;
    }

    const nextAction = actions[targetClipName];
    if (!nextAction) return;

    const previousAction = currentAction.current;
    if (previousAction === nextAction) return;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    nextAction.setEffectiveTimeScale(activeEmote ? 1.25 : 1);
    nextAction.setEffectiveWeight(1);

    nextAction.fadeIn(0.25).play();
    previousAction?.fadeOut(0.25);

    currentAction.current = nextAction;
  }, [enabled, targetClipName, actions, activeEmote]);

  useEffect(() => {
    return () => {
      if (currentAction.current) {
        currentAction.current.fadeOut(0.15);
      }
      currentAction.current = null;
    };
  }, []);

  return {
    animationName: targetClipName,
    currentAction,
  };
}

