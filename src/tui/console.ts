function print(prefix: string, message: string) {
  console.log(`${prefix} ${message}`);
}

export function intro(message: string) {
  print(">", message);
}

export function outro(message: string) {
  print(">", message);
}

export function note(message: string, title: string) {
  console.log(`[${title}]`);
  console.log(message);
}

export const log = {
  success(message: string) {
    print("+", message);
  },
  warning(message: string) {
    print("!", message);
  },
};
