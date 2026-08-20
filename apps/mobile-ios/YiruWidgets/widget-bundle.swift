import SwiftUI
import WidgetKit

@main
struct YiruWidgetBundle: WidgetBundle {
    var body: some Widget {
        ChatGPTUsageWidget()
        ClaudeUsageWidget()
        TokenUsageWidget()
    }
}
