const AUTOMOTIVE_EDUCATION_PATTERNS = [
  /\bhow\s+(?:(?:does|do|is|are)\s+)?(?:(?:a|an|the)\s+)?(?:(?:car|vehicle|automotive)\s+)?(?:engines?|doors?|brakes?|transmissions?|gearboxes|airbags?|steering|suspension|tires?|tyres?|wheels?|batteries|motors?|seatbelts?|fuel\s+systems?|exhausts?|radiators?|air\s+conditioning|crumple\s+zones?|cars?|vehicles?)\s+(?:(?:is|are)\s+)?(?:work|works|function|functions|operate|operates|open|opens|made|built|manufactured|designed|powered|charged)\b/i,
  /\b(?:explain|describe)\s+(?:(?:how|why)\s+)?(?:(?:a|an|the)\s+)?(?:(?:car|vehicle|automotive)\s+)?(?:engines?|doors?|brakes?|transmissions?|gearboxes|airbags?|steering|suspension|tires?|tyres?|wheels?|batteries|motors?|seatbelts?|fuel\s+systems?|exhausts?|radiators?|air\s+conditioning|crumple\s+zones?|cars?|vehicles?)\b/i,
];

const ACTIVE_SHOPPING_PATTERNS = [
  /\b(?:search|show|find|list)\s+(?:me\s+)?(?:cars?|vehicles?|inventory)\b/i,
  /\b(?:available|availability|inventory|test[\s-]?drive|book|booking|appointment|price|budget)\b/i,
  /\b(?:compare|comparing)\s+(?:the\s+)?(?:cars?|vehicles?|models?|options?)\b/i,
];

export function getFocusedAutomotiveReply(message: string): string | undefined {
  if (
    AUTOMOTIVE_EDUCATION_PATTERNS.some((pattern) => pattern.test(message)) &&
    !ACTIVE_SHOPPING_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return "I can help with general car questions, but I’m most useful for helping you choose a vehicle. What body style or budget should I use to find options in our inventory?";
  }

  return undefined;
}
