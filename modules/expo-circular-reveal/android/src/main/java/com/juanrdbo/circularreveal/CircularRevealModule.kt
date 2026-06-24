package com.juanrdbo.circularreveal

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.hypot

class CircularRevealModule : Module() {
    private var overlayView: CircularRevealView? = null
    private var revealState: RevealState? = null
    private var revealAnimator: ValueAnimator? = null
    private var activeStartPromise: Promise? = null
    private val handler = Handler(Looper.getMainLooper())

    private data class RevealState(
        val overlay: CircularRevealView,
        val bitmap: Bitmap,
        val contentView: ViewGroup,
        val maxRadius: Float,
    )

    override fun definition() =
        ModuleDefinition {
            Name("CircularReveal")

            AsyncFunction("prepareCircularReveal") { centerX: Double, centerY: Double, promise: Promise ->
                prepareCircularReveal(centerX, centerY, promise)
            }

            AsyncFunction("startCircularReveal") { durationMs: Int, promise: Promise ->
                startCircularReveal(durationMs, promise)
            }

            AsyncFunction("cancelCircularReveal") { promise: Promise ->
                handler.post {
                    clearCurrentReveal(rejectActiveStart = true)
                    promise.resolve(null)
                }
            }

            AsyncFunction("triggerTransition") { centerX: Double, centerY: Double, durationMs: Int, promise: Promise ->
                prepareCircularReveal(centerX, centerY, promise) {
                    handler.postDelayed({
                        startCircularReveal(durationMs, null)
                    }, 50)
                }
            }
        }

    private fun prepareCircularReveal(
        centerX: Double,
        centerY: Double,
        promise: Promise,
        onReady: (() -> Unit)? = null,
    ) {
        val activity = appContext.currentActivity
        if (activity == null) {
            promise.reject(CodedException("ERR_NO_ACTIVITY", "No current activity", null))
            return
        }

        handler.post {
            try {
                val window = activity.window
                val decorView = window.decorView
                val contentView = decorView as? ViewGroup

                if (contentView == null) {
                    promise.reject(CodedException("ERR_NO_CONTENT_VIEW", "Window decor view is not a ViewGroup", null))
                    return@post
                }

                val width = decorView.width
                val height = decorView.height

                if (width <= 0 || height <= 0) {
                    promise.reject(CodedException("ERR_INVALID_SIZE", "View has zero size", null))
                    return@post
                }

                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                val density = activity.resources.displayMetrics.density
                val cx = (centerX * density).toFloat()
                val cy = (centerY * density).toFloat()

                val maxRadius =
                    maxOf(
                        hypot(cx.toDouble(), cy.toDouble()),
                        hypot((width - cx).toDouble(), cy.toDouble()),
                        hypot(cx.toDouble(), (height - cy).toDouble()),
                        hypot((width - cx).toDouble(), (height - cy).toDouble()),
                    ).toFloat()

                val onCaptured = { capturedBitmap: Bitmap ->
                    handler.post {
                        clearCurrentReveal(rejectActiveStart = true)

                        val overlay = CircularRevealView(activity)
                        overlay.bitmap = capturedBitmap
                        overlay.holeCenterX = cx
                        overlay.holeCenterY = cy
                        overlay.holeRadius = 0f
                        overlay.layoutParams =
                            FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT,
                            )

                        contentView.addView(overlay)
                        overlayView = overlay
                        revealState = RevealState(overlay, capturedBitmap, contentView, maxRadius)

                        overlay.post {
                            promise.resolve("ready")
                            onReady?.invoke()
                        }
                    }
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    PixelCopy.request(
                        window,
                        bitmap,
                        { result ->
                            if (result == PixelCopy.SUCCESS) {
                                onCaptured(bitmap)
                            } else {
                                bitmap.recycle()
                                promise.reject(CodedException("ERR_PIXEL_COPY", "PixelCopy failed: $result", null))
                            }
                        },
                        handler,
                    )
                } else {
                    decorView.isDrawingCacheEnabled = true
                    val cache = decorView.drawingCache
                    if (cache != null) {
                        val copy = cache.copy(Bitmap.Config.ARGB_8888, false)
                        decorView.isDrawingCacheEnabled = false
                        bitmap.recycle()
                        onCaptured(copy)
                    } else {
                        decorView.isDrawingCacheEnabled = false
                        bitmap.recycle()
                        promise.reject(CodedException("ERR_CACHE", "Drawing cache null", null))
                    }
                }
            } catch (e: Exception) {
                promise.reject(CodedException("ERR_CAPTURE", e.message ?: "Capture failed", e))
            }
        }
    }

    private fun startCircularReveal(durationMs: Int, promise: Promise?) {
        handler.post {
            val state = revealState
            if (state == null) {
                promise?.reject(CodedException("ERR_NOT_PREPARED", "Circular reveal has not been prepared", null))
                return@post
            }

            revealAnimator?.removeAllListeners()
            revealAnimator?.cancel()
            activeStartPromise = promise

            val animator = ValueAnimator.ofFloat(state.overlay.holeRadius, state.maxRadius)
            revealAnimator = animator
            animator.duration = durationMs.coerceAtLeast(0).toLong()
            animator.interpolator = DecelerateInterpolator(1.5f)
            animator.addUpdateListener { anim ->
                state.overlay.holeRadius = anim.animatedValue as Float
            }
            animator.addListener(
                object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        if (revealAnimator !== animation) return

                        revealAnimator = null
                        val startPromise = activeStartPromise
                        activeStartPromise = null
                        removeOverlay()
                        startPromise?.resolve("finished")
                    }
                },
            )
            animator.start()
        }
    }

    private fun clearCurrentReveal(rejectActiveStart: Boolean) {
        revealAnimator?.removeAllListeners()
        revealAnimator?.cancel()
        revealAnimator = null

        if (rejectActiveStart) {
            activeStartPromise?.reject(CodedException("ERR_CANCELLED", "Circular reveal cancelled", null))
        }
        activeStartPromise = null

        removeOverlay()
    }

    private fun removeOverlay() {
        revealState?.let { state ->
            (state.overlay.parent as? ViewGroup)?.removeView(state.overlay)
            if (!state.bitmap.isRecycled) {
                state.bitmap.recycle()
            }
        }
        revealState = null
        overlayView = null
    }
}
