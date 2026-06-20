import ActivityKit
import Capacitor
import Foundation

/// JS 의 `LiveActivity` 플러그인 → ActivityKit 브릿지.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin {

    @objc public override func load() {
        // 필요시 초기화. 현재는 비어있음.
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            let info = ActivityAuthorizationInfo()
            call.resolve(["supported": info.areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    @objc func startClass(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("iOS 16.1+ 가 필요합니다.")
            return
        }
        let info = ActivityAuthorizationInfo()
        guard info.areActivitiesEnabled else {
            call.reject("Live Activities 가 시스템 설정에서 꺼져 있어요. 설정 → 알림 → Live Activities 허용 필요.")
            return
        }

        let location = call.getString("location") ?? ""
        let startLabel = call.getString("startLabel") ?? "시작"
        let endLabel = call.getString("endLabel") ?? "끝"
        let startAtMs = call.getDouble("startAtMs") ?? 0
        let endAtMs = call.getDouble("endAtMs") ?? 0
        guard startAtMs > 0, endAtMs > startAtMs else {
            call.reject("startAtMs / endAtMs 값이 유효하지 않습니다.")
            return
        }

        let state = KJHEDULiveActivityAttributes.ClassContentState(
            location: location,
            startLabel: startLabel,
            endLabel: endLabel,
            startAt: Date(timeIntervalSince1970: startAtMs / 1000),
            endAt: Date(timeIntervalSince1970: endAtMs / 1000)
        )
        let attributes = KJHEDULiveActivityAttributes()
        // 종료 30분 후엔 stale 처리 → 시스템이 자동으로 dim/dismiss
        let staleDate = Date(timeIntervalSince1970: endAtMs / 1000 + 30 * 60)

        do {
            if #available(iOS 16.2, *) {
                let activity = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: staleDate),
                    pushType: nil
                )
                call.resolve(["id": activity.id])
            } else {
                // iOS 16.1
                let activity = try Activity.request(
                    attributes: attributes,
                    contentState: state,
                    pushType: nil
                )
                call.resolve(["id": activity.id])
            }
        } catch {
            call.reject("Activity 시작 실패: \(error.localizedDescription)")
        }
    }

    @objc func updateClass(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("iOS 16.1+ 가 필요합니다.")
            return
        }
        let id = call.getString("id") ?? ""
        guard !id.isEmpty else {
            call.reject("id 가 필요합니다.")
            return
        }

        let activities = Activity<KJHEDULiveActivityAttributes>.activities
        guard let activity = activities.first(where: { $0.id == id }) else {
            call.reject("해당 id 의 Activity 를 찾을 수 없습니다.")
            return
        }

        let prev = activity.contentState
        let newState = KJHEDULiveActivityAttributes.ClassContentState(
            location: call.getString("location") ?? prev.location,
            startLabel: call.getString("startLabel") ?? prev.startLabel,
            endLabel: call.getString("endLabel") ?? prev.endLabel,
            startAt: call.getDouble("startAtMs").map {
                Date(timeIntervalSince1970: $0 / 1000)
            } ?? prev.startAt,
            endAt: call.getDouble("endAtMs").map {
                Date(timeIntervalSince1970: $0 / 1000)
            } ?? prev.endAt
        )
        let staleDate = Date(timeIntervalSince1970: newState.endAt.timeIntervalSince1970 + 30 * 60)

        Task {
            if #available(iOS 16.2, *) {
                await activity.update(
                    ActivityContent(state: newState, staleDate: staleDate)
                )
            } else {
                await activity.update(using: newState)
            }
            await MainActor.run { call.resolve() }
        }
    }

    @objc func endClass(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        let id = call.getString("id")
        Task {
            let activities = Activity<KJHEDULiveActivityAttributes>.activities
            if let id = id, !id.isEmpty {
                if let act = activities.first(where: { $0.id == id }) {
                    if #available(iOS 16.2, *) {
                        await act.end(nil, dismissalPolicy: .immediate)
                    } else {
                        await act.end(dismissalPolicy: .immediate)
                    }
                }
            } else {
                for act in activities {
                    if #available(iOS 16.2, *) {
                        await act.end(nil, dismissalPolicy: .immediate)
                    } else {
                        await act.end(dismissalPolicy: .immediate)
                    }
                }
            }
            await MainActor.run { call.resolve() }
        }
    }

    @objc func currentId(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["id": ""])
            return
        }
        let id = Activity<KJHEDULiveActivityAttributes>.activities.first?.id ?? ""
        call.resolve(["id": id])
    }
}
