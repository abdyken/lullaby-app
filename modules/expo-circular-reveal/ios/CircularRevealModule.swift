import ExpoModulesCore
import UIKit

public class CircularRevealModule: Module {
    private var overlayView: UIImageView?
    private var revealState: RevealState?
    private var activeStartPromise: Promise?
    private var activeAnimationID: UUID?

    private struct RevealState {
        let overlay: UIImageView
        let maskLayer: CAShapeLayer
        let center: CGPoint
        let maxRadius: CGFloat
    }

    public func definition() -> ModuleDefinition {
        Name("CircularReveal")

        AsyncFunction("prepareCircularReveal") { (centerX: Double, centerY: Double, promise: Promise) in
            self.prepareCircularReveal(centerX: centerX, centerY: centerY, promise: promise)
        }

        AsyncFunction("startCircularReveal") { (durationMs: Int, promise: Promise) in
            self.startCircularReveal(durationMs: durationMs, promise: promise)
        }

        AsyncFunction("cancelCircularReveal") { (promise: Promise) in
            DispatchQueue.main.async { [weak self] in
                self?.clearCurrentReveal(rejectActiveStart: true)
                promise.resolve(nil)
            }
        }

        AsyncFunction("triggerTransition") { (centerX: Double, centerY: Double, durationMs: Int, promise: Promise) in
            self.prepareCircularReveal(centerX: centerX, centerY: centerY, promise: promise) { [weak self] in
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self?.startCircularReveal(durationMs: durationMs, promise: nil)
                }
            }
        }
    }

    private func prepareCircularReveal(
        centerX: Double,
        centerY: Double,
        promise: Promise,
        onReady: (() -> Void)? = nil
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                promise.reject("ERR_MODULE_DEALLOCATED", "CircularReveal module was deallocated")
                return
            }

            guard let window = UIApplication.shared
                .connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0.isKeyWindow })
            else {
                promise.reject("ERR_NO_WINDOW", "No key window found")
                return
            }

            let bounds = window.bounds
            guard bounds.width > 0, bounds.height > 0 else {
                promise.reject("ERR_INVALID_SIZE", "Window has zero size")
                return
            }

            let renderer = UIGraphicsImageRenderer(bounds: bounds)
            let image = renderer.image { _ in
                window.drawHierarchy(in: bounds, afterScreenUpdates: false)
            }

            self.clearCurrentReveal(rejectActiveStart: true)

            let center = CGPoint(x: centerX, y: centerY)
            let maxRadius = max(
                hypot(center.x, center.y),
                hypot(bounds.width - center.x, center.y),
                hypot(center.x, bounds.height - center.y),
                hypot(bounds.width - center.x, bounds.height - center.y)
            )

            let overlay = UIImageView(image: image)
            overlay.frame = bounds
            overlay.contentMode = .scaleToFill

            let maskLayer = CAShapeLayer()
            maskLayer.frame = bounds
            maskLayer.fillRule = .evenOdd
            maskLayer.path = self.revealPath(bounds: bounds, center: center, radius: 0.001).cgPath
            overlay.layer.mask = maskLayer

            window.addSubview(overlay)
            self.overlayView = overlay
            self.revealState = RevealState(
                overlay: overlay,
                maskLayer: maskLayer,
                center: center,
                maxRadius: maxRadius
            )

            DispatchQueue.main.async {
                promise.resolve("ready")
                onReady?()
            }
        }
    }

    private func startCircularReveal(durationMs: Int, promise: Promise?) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                promise?.reject("ERR_MODULE_DEALLOCATED", "CircularReveal module was deallocated")
                return
            }

            guard let state = self.revealState else {
                promise?.reject("ERR_NOT_PREPARED", "Circular reveal has not been prepared")
                return
            }

            state.maskLayer.removeAnimation(forKey: "circularReveal")

            let bounds = state.overlay.bounds
            let currentPath = state.maskLayer.presentation()?.path ?? state.maskLayer.path
            let endPath = self.revealPath(bounds: bounds, center: state.center, radius: state.maxRadius).cgPath
            let animationID = UUID()

            self.activeStartPromise = promise
            self.activeAnimationID = animationID
            state.maskLayer.path = endPath

            let animation = CABasicAnimation(keyPath: "path")
            animation.fromValue = currentPath
            animation.toValue = endPath
            animation.duration = Double(max(durationMs, 0)) / 1000.0
            animation.timingFunction = CAMediaTimingFunction(name: .easeOut)
            animation.isRemovedOnCompletion = false
            animation.fillMode = .forwards

            CATransaction.begin()
            CATransaction.setCompletionBlock { [weak self] in
                DispatchQueue.main.async {
                    guard let self, self.activeAnimationID == animationID else {
                        return
                    }

                    let startPromise = self.activeStartPromise
                    self.activeStartPromise = nil
                    self.activeAnimationID = nil
                    self.removeOverlay()
                    startPromise?.resolve("finished")
                }
            }
            state.maskLayer.add(animation, forKey: "circularReveal")
            CATransaction.commit()
        }
    }

    private func clearCurrentReveal(rejectActiveStart: Bool) {
        revealState?.maskLayer.removeAnimation(forKey: "circularReveal")
        activeAnimationID = nil

        if rejectActiveStart {
            activeStartPromise?.reject("ERR_CANCELLED", "Circular reveal cancelled")
        }
        activeStartPromise = nil

        removeOverlay()
    }

    private func removeOverlay() {
        overlayView?.removeFromSuperview()
        overlayView = nil
        revealState = nil
    }

    private func revealPath(bounds: CGRect, center: CGPoint, radius: CGFloat) -> UIBezierPath {
        let path = UIBezierPath(rect: bounds)
        let hole = UIBezierPath(
            arcCenter: center,
            radius: radius,
            startAngle: 0,
            endAngle: .pi * 2,
            clockwise: true
        )
        path.append(hole)
        path.usesEvenOddFillRule = true
        return path
    }
}
