import SwiftUI

struct HomeOnboardingView: View {
    let showPairing: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 12) {
                    Text("Connect your desktop")
                        .font(.system(size: 16, weight: .bold))
                    Text(
                        "Pair with Yiru on your computer to check on your agents, jump into any terminal, and drive work from your phone."
                    )
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)

                    Button("Pair Desktop", action: showPairing)
                        .appProminentGlassButton()
                        .appButtonContext(.large)
                        .padding(.top, 20)
                }
                .padding(.horizontal, 32)
                .padding(.vertical, 80)

                VStack(alignment: .leading, spacing: 0) {
                    Text("HOW IT WORKS")
                        .font(.system(size: 12, weight: .semibold))
                        .tracking(0.4)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.horizontal, 4)
                        .padding(.bottom, 8)
                    ForEach(Array(homeOnboardingSteps.enumerated()), id: \.offset) { index, step in
                        if index > 0 { Divider() }
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(index + 1)")
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(step.title)
                                    .font(.system(size: 16, weight: .semibold))
                                Text(step.detail)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                                    .lineSpacing(3)
                            }
                        }
                        .padding(.vertical, 16)
                    }
                }
                .padding(.horizontal, 24)
            }
            .frame(maxWidth: Theme.Size.readingWidth)
            .frame(maxWidth: .infinity)
        }
    }
}

nonisolated private struct HomeOnboardingStep: Sendable {
    let title: LocalizedStringResource
    let detail: LocalizedStringResource
}

nonisolated private let homeOnboardingSteps = [
    HomeOnboardingStep(
        title: "Open Yiru desktop",
        detail: "Go to Settings → Mobile and generate a pairing QR code."
    ),
    HomeOnboardingStep(
        title: "Scan the code",
        detail: "Tap the button above to open the scanner. Point at the QR code on your screen."
    ),
    HomeOnboardingStep(
        title: "You're connected",
        detail: "Your desktop will appear here. Everything is encrypted end-to-end."
    ),
]
