import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from 'cn'

function Slider({ className, children, ...props }: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root data-slot="slider" className={cn('w-full', className)} {...props}>
      <SliderPrimitive.Control className="flex h-5 w-full touch-none items-center">
        {children}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

function SliderTrack({ className, children, ...props }: SliderPrimitive.Track.Props) {
  return (
    <SliderPrimitive.Track
      data-slot="slider-track"
      className={cn('h-2 w-full rounded-full bg-muted', className)}
      {...props}
    >
      {children}
    </SliderPrimitive.Track>
  )
}

function SliderIndicator({ className, ...props }: SliderPrimitive.Indicator.Props) {
  return (
    <SliderPrimitive.Indicator
      data-slot="slider-indicator"
      className={cn('rounded-full bg-primary', className)}
      {...props}
    />
  )
}

function SliderThumb({ className, ...props }: SliderPrimitive.Thumb.Props) {
  return (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className={cn(
        'size-4 rounded-full border-2 border-background bg-foreground shadow outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}

export { Slider, SliderIndicator, SliderThumb, SliderTrack }
