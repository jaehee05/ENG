import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    // iOS 13+ Scene 라이프사이클: SceneDelegate를 connect.
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        let window = UIWindow(windowScene: windowScene)
        let bridgeVC = KJHEDUBridgeViewController()
        window.rootViewController = bridgeVC
        self.window = window
        window.makeKeyAndVisible()
    }
}

/// Capacitor 8 의 packageClassList(자동 생성) 에는 NPM 플러그인만 들어가서
/// in-project 커스텀 플러그인은 capacitorDidLoad 에서 직접 등록해야 함.
class KJHEDUBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
        bridge?.registerPluginInstance(ScreenGuardPlugin())
    }
}

/// 시험 화면에서 스크린샷·화면 녹화에 내용이 남지 않게 한다.
///
/// iOS 에는 스크린샷을 막는 공개 API 가 없다. 대신 보안 입력 필드
/// (`isSecureTextEntry`) 의 레이어 안에 앱 창을 넣으면, 시스템이 화면을 담을 때
/// 그 레이어를 비워서 검게 나온다. 은행 앱들이 쓰는 방법이다.
///
/// 애플이 보장하는 동작이 아니다. iOS 가 올라가면 조용히 무력화될 수 있는데,
/// 그때도 앱이 깨지지는 않고 스크린샷이 그냥 정상으로 찍힐 뿐이다.
///
/// 레이어를 옮기는 일은 처음 한 번만 하고, 그 뒤로는 `isSecureTextEntry` 만
/// 켜고 끈다 — 옮긴 것을 되돌리는 쪽이 훨씬 깨지기 쉽다. 시험을 한 번도 보지
/// 않은 학생의 앱은 레이어를 아예 건드리지 않는다.
@objc(ScreenGuardPlugin)
public class ScreenGuardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenGuardPlugin"
    public let jsName = "ScreenGuard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
    ]

    private lazy var secureField: UITextField = {
        let field = UITextField()
        field.isSecureTextEntry = true
        field.translatesAutoresizingMaskIntoConstraints = false
        // 화면을 가리거나 입력을 가로채면 안 된다. 레이어만 빌려 쓴다.
        field.isUserInteractionEnabled = false
        return field
    }()
    /// 창 레이어의 원래 부모. 끌 때 여기로 돌려놓는다.
    private weak var originalSuperlayer: CALayer?
    private weak var guardedWindow: UIWindow?

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.guardedWindow == nil else {
                self.secureField.isSecureTextEntry = true
                call.resolve(["applied": true])
                return
            }
            guard let window = self.keyWindow() else {
                call.resolve(["applied": false, "reason": "window-not-found"])
                return
            }

            // 필드를 창 전체에 맞춘다. 가운데에 두면 창 레이어가 그 원점을 물려받아
            // 화면이 통째로 오른쪽 아래로 밀린다.
            window.addSubview(self.secureField)
            NSLayoutConstraint.activate([
                self.secureField.leadingAnchor.constraint(equalTo: window.leadingAnchor),
                self.secureField.trailingAnchor.constraint(equalTo: window.trailingAnchor),
                self.secureField.topAnchor.constraint(equalTo: window.topAnchor),
                self.secureField.bottomAnchor.constraint(equalTo: window.bottomAnchor),
            ])
            window.layoutIfNeeded()

            // 보안 레이어는 필드를 화면에 붙여야 생긴다. 없으면 이 iOS 버전에서는
            // 안 통하는 것이므로 원래 계층을 그대로 두고 물러난다.
            guard let secureLayer = self.secureField.layer.sublayers?.last else {
                self.secureField.removeFromSuperview()
                call.resolve(["applied": false, "reason": "no-secure-layer"])
                return
            }

            self.originalSuperlayer = window.layer.superlayer
            window.layer.superlayer?.addSublayer(self.secureField.layer)
            secureLayer.addSublayer(window.layer)
            // 부모가 바뀌면 좌표계도 바뀐다. 창을 원래 자리·크기로 다시 앉힌다.
            window.layer.frame = window.bounds

            self.guardedWindow = window
            self.secureField.isSecureTextEntry = true
            call.resolve(["applied": true])
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.secureField.isSecureTextEntry = false
            // 옮긴 것을 되돌린다. 그대로 두면 이 화면을 한 번 지난 뒤 앱 전체가
            // 보안 레이어 안에 남아, 어긋난 것이 있어도 앱 전체에 계속 남는다.
            if let window = self.guardedWindow {
                self.originalSuperlayer?.addSublayer(window.layer)
                window.layer.frame = window.bounds
                self.secureField.layer.removeFromSuperlayer()
                self.secureField.removeFromSuperview()
                self.guardedWindow = nil
                self.originalSuperlayer = nil
            }
            call.resolve()
        }
    }

    private func keyWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
    }
}
