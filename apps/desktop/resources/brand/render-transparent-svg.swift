import AppKit

let arguments = CommandLine.arguments
guard arguments.count == 5,
      let width = Int(arguments[2]),
      let height = Int(arguments[3]) else {
    fatalError("Usage: render-transparent-svg.swift input.svg width height output.png")
}

let input = URL(fileURLWithPath: arguments[1])
let output = URL(fileURLWithPath: arguments[4])
guard let image = NSImage(contentsOf: input) else {
    fatalError("Could not load SVG: \(input.path)")
}
guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: width * 4,
    bitsPerPixel: 32
) else {
    fatalError("Could not create \(width)x\(height) bitmap")
}

bitmap.size = NSSize(width: width, height: height)
NSGraphicsContext.saveGraphicsState()
guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Could not create bitmap graphics context")
}
NSGraphicsContext.current = context
// Why: native icon sizing and tinting depend on preserving the SVG's transparent regions.
context.cgContext.clear(CGRect(x: 0, y: 0, width: width, height: height))
image.draw(
    in: NSRect(x: 0, y: 0, width: width, height: height),
    from: .zero,
    operation: .copy,
    fraction: 1,
    respectFlipped: true,
    hints: [.interpolation: NSImageInterpolation.high]
)
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let data = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode PNG")
}
try data.write(to: output)
