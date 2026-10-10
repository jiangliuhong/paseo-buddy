#import <AppKit/AppKit.h>
int main(int argc, const char **argv) {
  @autoreleasepool {
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:1024 pixelsHigh:1024 bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    [NSGraphicsContext saveGraphicsState];
    [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap]];
    [[NSColor colorWithCalibratedWhite:0.98 alpha:1] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(40,40,944,944) xRadius:210 yRadius:210] fill];
    NSBezierPath *pulse=[NSBezierPath bezierPath];
    [pulse moveToPoint:NSMakePoint(182,510)];
    [pulse lineToPoint:NSMakePoint(344,510)];
    [pulse lineToPoint:NSMakePoint(430,744)];
    [pulse lineToPoint:NSMakePoint(572,280)];
    [pulse lineToPoint:NSMakePoint(664,510)];
    [pulse lineToPoint:NSMakePoint(842,510)];
    [pulse setLineWidth:48];[pulse setLineCapStyle:NSLineCapStyleRound];[pulse setLineJoinStyle:NSLineJoinStyleRound];
    [[NSColor colorWithCalibratedRed:0.13 green:0.54 blue:0.34 alpha:1] setStroke];[pulse stroke];
    [NSGraphicsContext restoreGraphicsState];
    NSData *png=[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    return [png writeToFile:[NSString stringWithUTF8String:argv[1]] atomically:YES] ? 0 : 1;
  }
}
