import LottieView, { type AnimationObject } from 'lottie-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';

import { useReduceMotion } from '@/lib/useReduceMotion';
import { BRAND_LAUNCH } from '@/theme/brandLaunch';

const staticLogoSource = require('../../../assets/images/lullaby-logo-mark.png');
const logoDrawAnimationKey = './lullaby-logo-draw.json';
const FILL = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };
const logoDrawAnimationContext = require.context(
  '../../../assets/animations',
  false,
  /lullaby-logo-draw\.json$/,
);

type BrandSplashGateProps = {
  children: ReactNode;
};

function getLullabyLogoDrawAnimationSource(): AnimationObject | null {
  if (!logoDrawAnimationContext.keys().includes(logoDrawAnimationKey)) {
    return null;
  }

  return logoDrawAnimationContext(logoDrawAnimationKey) as AnimationObject;
}

export function BrandSplashGate({ children }: BrandSplashGateProps) {
  const reduceMotion = useReduceMotion();
  const [drawAnimationSource] = useState(() => getLullabyLogoDrawAnimationSource());
  const [visible, setVisible] = useState(true);

  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const [logoOpacity] = useState(() => new Animated.Value(BRAND_LAUNCH.initialLogoOpacity));
  const [logoScale] = useState(() => new Animated.Value(BRAND_LAUNCH.initialLogoScale));

  useEffect(() => {
    if (reduceMotion === null) {
      return undefined;
    }

    let active = true;
    let fadeTimer: ReturnType<typeof setTimeout>;
    let logoAnimation: Animated.CompositeAnimation | null = null;

    const hideOverlay = () => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: reduceMotion
          ? BRAND_LAUNCH.reduceMotionFadeOutMs
          : BRAND_LAUNCH.overlayFadeOutMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && active) {
          setVisible(false);
        }
      });
    };

    if (reduceMotion) {
      logoOpacity.setValue(1);
      logoScale.setValue(1);
      fadeTimer = setTimeout(hideOverlay, BRAND_LAUNCH.reduceMotionHoldMs);
    } else if (drawAnimationSource) {
      logoOpacity.setValue(1);
      logoScale.setValue(1);
      fadeTimer = setTimeout(hideOverlay, BRAND_LAUNCH.minDurationMs);
    } else {
      logoOpacity.setValue(BRAND_LAUNCH.initialLogoOpacity);
      logoScale.setValue(BRAND_LAUNCH.initialLogoScale);
      logoAnimation = Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: BRAND_LAUNCH.logoFadeInMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: BRAND_LAUNCH.logoScaleInMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);

      logoAnimation.start();
      fadeTimer = setTimeout(hideOverlay, BRAND_LAUNCH.minDurationMs);
    }

    return () => {
      active = false;
      clearTimeout(fadeTimer);
      logoAnimation?.stop();
    };
  }, [
    drawAnimationSource,
    logoOpacity,
    logoScale,
    overlayOpacity,
    reduceMotion,
  ]);

  const shouldRenderLottieDrawAnimation = reduceMotion === false && drawAnimationSource !== null;

  return (
    <View style={styles.root}>
      {children}
      {visible ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Animated.View
            accessible
            accessibilityLabel="Lullaby"
            style={[
              styles.logoFrame,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}>
            {shouldRenderLottieDrawAnimation ? (
              <LottieView
                autoPlay
                loop={false}
                resizeMode="contain"
                source={drawAnimationSource}
                style={styles.logo}
              />
            ) : (
              <Image source={staticLogoSource} resizeMode="contain" style={styles.logo} />
            )}
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_LAUNCH.revealBackgroundColor,
  },
  overlay: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_LAUNCH.backgroundColor,
    zIndex: 999,
  },
  logoFrame: {
    height: BRAND_LAUNCH.logoSize,
    width: BRAND_LAUNCH.logoSize,
  },
  logo: {
    height: '100%',
    width: '100%',
  },
});
