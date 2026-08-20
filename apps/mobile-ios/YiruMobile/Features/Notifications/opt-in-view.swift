import SwiftUI
import UserNotifications

struct NotificationOptInView: View {
    let onFinished: () -> Void
    @State private var busyChoice: NotificationOptInChoice?
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    YiruIcon(.bellRinging, size: 30)
                        .frame(width: 64, height: 64)
                        .padding(.bottom, 24)
                    Text("NOTIFICATIONS")
                        .font(.system(size: 12, weight: .semibold))
                        .tracking(0.5)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.bottom, 8)
                    Text("Stay updated while away")
                        .font(.system(size: 14, weight: .bold))
                        .multilineTextAlignment(.center)
                    Text(
                        "Get notified on this device when an agent needs your input or finishes a task."
                    )
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.top, 12)
                }
                .frame(maxWidth: 448)
                .frame(maxWidth: .infinity, minHeight: 420)

                VStack(spacing: 8) {
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Colors.attention)
                            .multilineTextAlignment(.center)
                            .accessibilityLabel(errorMessage)
                    }
                    choiceButton(
                        title: "Enable notifications",
                        choice: .enable,
                        isProminent: true
                    )
                    choiceButton(title: "Not now", choice: .skip, isProminent: false)
                    Text("You can change this any time in Settings.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: 448)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 16)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, minHeight: 720)
        }
        .scrollIndicators(.hidden)
        .background(Theme.Colors.background)
        .interactiveDismissDisabled()
    }

    @ViewBuilder
    private func choiceButton(
        title: LocalizedStringKey,
        choice: NotificationOptInChoice,
        isProminent: Bool
    ) -> some View {
        if busyChoice == choice {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: Theme.Size.minimumHitTarget)
        } else if isProminent {
            Button {
                Task { await choose(choice) }
            } label: {
                Text(title).frame(maxWidth: .infinity)
            }
            .appProminentGlassButton()
            .appButtonContext(.large)
            .disabled(busyChoice != nil)
        } else {
            Button {
                Task { await choose(choice) }
            } label: {
                Text(title).frame(maxWidth: .infinity)
            }
            .buttonStyle(.glass)
            .appButtonContext(.large)
            .disabled(busyChoice != nil)
        }
    }

    private func choose(_ choice: NotificationOptInChoice) async {
        guard busyChoice == nil else { return }
        busyChoice = choice
        errorMessage = nil
        do {
            let enabled: Bool
            if choice == .enable {
                enabled = try await UNUserNotificationCenter.current().requestAuthorization(
                    options: [.alert, .badge, .sound]
                )
            } else {
                enabled = false
            }
            NotificationPreference.save(enabled)
            onFinished()
        } catch {
            errorMessage = "Notification settings could not be updated. Try again."
            busyChoice = nil
        }
    }
}

private enum NotificationOptInChoice {
    case enable
    case skip
}
