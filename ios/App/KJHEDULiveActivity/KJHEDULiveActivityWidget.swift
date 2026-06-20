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
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        CarouselDot()
                            .frame(width: 14, height: 14)
                        Text(context.state.location.isEmpty ? "수업" : context.state.location)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 4) {
                        Image(systemName: "graduationcap.fill")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text("KJHEDU")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    ExpandedCenterView(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottomView(state: context.state)
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
                HStack(spacing: 6) {
                    CarouselDot()
                        .frame(width: 16, height: 16)
                    Text(state.location.isEmpty ? "수업" : state.location)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "graduationcap.fill")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("KJHEDU")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.startLabel.isEmpty ? "시작" : state.startLabel)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(state.startAt, style: .time)
                        .font(.title3.bold())
                        .foregroundColor(.kjheduGreen)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(state.endLabel.isEmpty ? "끝" : state.endLabel)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(state.endAt, style: .time)
                        .font(.title3.bold())
                        .foregroundColor(.kjheduGreen)
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

struct ExpandedCenterView: View {
    let state: KJHEDULiveActivityAttributes.ClassContentState

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(state.startLabel.isEmpty ? "시작" : state.startLabel)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(state.startAt, style: .time)
                    .font(.headline)
                    .foregroundColor(.kjheduGreen)
            }
            Spacer()
            Image(systemName: "pencil")
                .foregroundColor(.kjheduGreen)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(state.endLabel.isEmpty ? "끝" : state.endLabel)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(state.endAt, style: .time)
                    .font(.headline)
                    .foregroundColor(.kjheduGreen)
            }
        }
    }
}

struct ExpandedBottomView: View {
    let state: KJHEDULiveActivityAttributes.ClassContentState

    var body: some View {
        VStack(spacing: 6) {
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
