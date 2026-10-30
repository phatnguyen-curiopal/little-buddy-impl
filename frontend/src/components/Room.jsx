// Buddy's room: a dotted wall, a night window and the floor, the
// Talking-Tom-style home every big Buddy stands in. Pure decoration (the
// shapes are aria-hidden); whatever is passed as children sits on top, and a
// figure inside .room-stage stands on its own rug. night dims it for a
// resting toy.
//
// scene lays the room out as a column: .scene-stage (where Buddy stands, as
// tall as the room allows) above .scene-ground (the floor, holding the
// controls). The figure's feet then always meet the floor, however tall the
// controls under it grow.
export default function Room({ night = false, size = 'md', scene = false, className = '', children, ...rest }) {
  return (
    <div className={['room', `room--${size}`, scene && 'room--scene', night && 'room--night', className].filter(Boolean).join(' ')} {...rest}>
      <span className="room-window" aria-hidden="true"><span className="room-moon" /><span className="room-star" /><span className="room-star room-star--b" /></span>
      <span className="room-floor" aria-hidden="true" />
      {children}
    </div>
  );
}
