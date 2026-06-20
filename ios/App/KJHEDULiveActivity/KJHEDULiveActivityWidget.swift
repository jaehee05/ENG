import ActivityKit
import SwiftUI
import WidgetKit

struct KJHEDULiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: KJHEDULiveActivityAttributes.self) { context in
            // ----- 잠금화면 / 배너 -----
            LockScreenView(state: context.state)
                .activityBackgroundTint(Color.black)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // 좁은 leading/trailing 에는 아이콘만 — 카메라 노치 옆이라 텍스트는 자주 깨짐
                DynamicIslandExpandedRegion(.leading) {
                    Text("📍")
                        .font(.callout)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CarouselDot()
                        .frame(width: 18, height: 18)
                }
                // 정보는 모두 bottom 영역(노치 아래 풀-와이드)에 배치
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedFullView(state: context.state)
                }
            } compactLeading: {
                Image(systemName: "pencil")
                    .foregroundColor(.kjheduGreen)
            } compactTrailing: {
                CompactTrailing(state: context.state)
            } minimal: {
                Image(systemName: "pencil")
                    .foregroundColor(.kjheduGreen)
            }
            .keylineTint(.kjheduGreen)
        }
    }
}

// MARK: - 잠금화면 (Lock Screen / Banner)

struct LockScreenView: View {
    let state: KJHEDULiveActivityAttributes.ClassContentState

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center) {
                HStack(spacing: 4) {
                    Text("📍")
                        .font(.caption)
                    Text(state.location.isEmpty ? "수업" : state.location)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                HStack(spacing: 4) {
                    CarouselDot()
                        .frame(width: 16, height: 16)
                    Text("KJHEDU")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(state.startLabel.isEmpty ? "시작" : state.startLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    Text(state.startAt, style: .time)
                        .font(.title3.bold())
                        .foregroundColor(.kjheduGreen)
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(state.endAt, style: .time)
                        .font(.title3.bold())
                        .foregroundColor(.kjheduGreen)
                    Text(state.endLabel.isEmpty ? "끝" : state.endLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                }
            }

            ProgressBar(state: state)
                .frame(height: 14)

            HStack {
                Text(statusText(state: state))
                    .font(.caption.bold())
                    .foregroundColor(.kjheduGreen)
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    countdownText(state: state)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    Text(untilText(state: state))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }
}

// MARK: - 캐러셀 로고 (간이 버전)
//
// 실제 J 로고 PNG 를 표시하려면 KJHEDULiveActivity Asset Catalog 에
// "CarouselLogo" 이미지 세트를 추가한 뒤 이 View 를
// `Image("CarouselLogo").resizable().clipShape(Circle())` 로 바꿔 사용.
struct CarouselDot: View {
    var body: some View {
        ZStack {
            Circle().fill(Color.kjheduGreen)
            Text("J")
                .font(.system(size: 10, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
        }
    }
}

// MARK: - 진행률 바 (연필 아이콘 슬라이드)

struct ProgressBar: View {
    let state: KJHEDULiveActivityAttributes.ClassContentState

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.18))
                Capsule()
                    .fill(Color.kjheduGreen)
                    .frame(width: max(0, proxy.size.width * progressFraction()))
                Image(systemName: "pencil")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
                    .background(
                        Circle().fill(Color.kjheduGreenDark)
                    )
                    .offset(
                        x: max(0, min(proxy.size.width - 16, proxy.size.width * progressFraction() - 8))
                    )
            }
        }
    }

    private func progressFraction() -> CGFloat {
        let total = state.endAt.timeIntervalSince(state.startAt)
        guard total > 0 else { return 0 }
        let elapsed = Date().timeIntervalSince(state.startAt)
        return CGFloat(min(max(elapsed / total, 0), 1))
    }
}

// MARK: - Dynamic Island Compact / Expanded sub views

struct CompactTrailing: View {
    let state: KJHEDULiveActivityAttributes.ClassContentState

    var body: some View {
        // 수업 전이면 시작까지 카운트다운, 수업 중이면 종료까지 카운트다운
        let target = Date() < state.startAt ? state.startAt : state.endAt
        Text(timerInterval: Date()...target, countsDown: true)
            .monospacedDigit()
            .foregroundColor(.kjheduGreen)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 70)
    }
}

/// Dynamic Island expanded 의 bottom 영역에 들어가는 풀-와이드 뷰.
/// LockScreenView 와 거의 동일하나 상단의 location/KJHEDU 행이 다이내믹 아일랜드 안으로 들어가게 됨.
struct ExpandedFullView: View {
    let state: KJHEDULiveActivityAttributes.ClassContentState

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                HStack(spacing: 4) {
                    Text("📍").font(.caption)
                    Text(state.location.isEmpty ? "수업" : state.location)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 8)
                HStack(spacing: 4) {
                    CarouselDot()
                        .frame(width: 14, height: 14)
                    Text("KJHEDU")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            HStack(alignment: .firstTextBaseline) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(state.startLabel.isEmpty ? "시작" : state.startLabel)
                        .font(.subheadline.weight(.semibold))
                    Text(state.startAt, style: .time)
                        .font(.title3.bold())
                        .foregroundColor(.kjheduGreen)
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(state.endAt, style: .time)
                        .font(.title3.bold())
                        .foregroundColor(.kjheduGreen)
                    Text(state.endLabel.isEmpty ? "끝" : state.endLabel)
                        .font(.subheadline.weight(.semibold))
                }
            }
            ProgressBar(state: state)
                .frame(height: 12)
            HStack {
                Text(statusText(state: state))
                    .font(.caption.bold())
                    .foregroundColor(.kjheduGreen)
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    countdownText(state: state)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                    Text(untilText(state: state))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                }
            }
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - 헬퍼

func statusText(state: KJHEDULiveActivityAttributes.ClassContentState) -> String {
    let now = Date()
    if now < state.startAt { return "수업 전" }
    if now < state.endAt { return "수업 중" }
    return "수업 완료"
}

func untilText(state: KJHEDULiveActivityAttributes.ClassContentState) -> String {
    let now = Date()
    if now < state.startAt { return "수업 시작까지" }
    if now < state.endAt { return "수업 종료까지" }
    return "오늘 수업 종료됨"
}

@ViewBuilder
func countdownText(state: KJHEDULiveActivityAttributes.ClassContentState) -> some View {
    let now = Date()
    if now < state.startAt {
        Text(timerInterval: now...state.startAt, countsDown: true)
            .monospacedDigit()
    } else if now < state.endAt {
        Text(timerInterval: now...state.endAt, countsDown: true)
            .monospacedDigit()
    } else {
        Text("00:00")
            .monospacedDigit()
    }
}
