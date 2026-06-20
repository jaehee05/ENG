import ActivityKit
import Foundation

/// 메인 앱(Capacitor 플러그인)과 Widget Extension 양쪽에서 공유되는 Live Activity 데이터 모델.
/// Xcode 에서 이 파일은 두 타겟 모두에 "Target Membership" 으로 추가해야 한다.
public struct KJHEDULiveActivityAttributes: ActivityAttributes {
    public typealias ContentState = ClassContentState

    /// Activity 가 변경되지 않는 정적 속성. 현재는 비어있음.
    public init() {}

    public struct ClassContentState: Codable, Hashable {
        /// 수업 장소 (예: "강남 본원 A호").
        public var location: String
        /// 시작 시각 옆에 붙는 짧은 라벨 (예: "시작").
        public var startLabel: String
        /// 종료 시각 옆에 붙는 짧은 라벨 (예: "끝").
        public var endLabel: String
        /// 수업 시작 시각.
        public var startAt: Date
        /// 수업 종료 시각.
        public var endAt: Date

        public init(
            location: String,
            startLabel: String,
            endLabel: String,
            startAt: Date,
            endAt: Date
        ) {
            self.location = location
            self.startLabel = startLabel
            self.endLabel = endLabel
            self.startAt = startAt
            self.endAt = endAt
        }
    }
}
