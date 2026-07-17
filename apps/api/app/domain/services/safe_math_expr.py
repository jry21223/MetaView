from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import lru_cache


class SafeMathExpressionError(ValueError):
    """Raised when a plot expression is outside the sandboxed grammar."""


Scope = Mapping[str, float]
CompiledExpression = Callable[[Scope], float]

_MAX_SOURCE_LENGTH = 512
_MAX_TOKENS = 256
_MAX_NESTING = 32
_MAX_FUNCTION_ARGUMENTS = 16
_OPERATOR_CHARS = frozenset("+-*/%^")
_CONSTANTS = {
    "pi": math.pi,
    "tau": math.tau,
    "e": math.e,
}


def _js_round(value: float) -> float:
    return float(math.floor(value + 0.5))


def _sign(value: float) -> float:
    if value > 0:
        return 1.0
    if value < 0:
        return -1.0
    return 0.0


def _minimum(*values: float) -> float:
    return min(values) if values else math.inf


def _maximum(*values: float) -> float:
    return max(values) if values else -math.inf


_FUNCTIONS: dict[str, Callable[..., float]] = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "atan2": math.atan2,
    "sinh": math.sinh,
    "cosh": math.cosh,
    "tanh": math.tanh,
    "exp": math.exp,
    "log": math.log,
    "ln": math.log,
    "log2": math.log2,
    "log10": math.log10,
    "sqrt": math.sqrt,
    "cbrt": math.cbrt,
    "abs": abs,
    "floor": lambda value: float(math.floor(value)),
    "ceil": lambda value: float(math.ceil(value)),
    "round": _js_round,
    "sign": _sign,
    "min": _minimum,
    "max": _maximum,
    "pow": math.pow,
    "hypot": math.hypot,
}


def _binary_expression(
    operator: str,
    left: CompiledExpression,
    right: CompiledExpression,
) -> CompiledExpression:
    if operator == "+":
        return lambda scope: left(scope) + right(scope)
    if operator == "-":
        return lambda scope: left(scope) - right(scope)
    if operator == "*":
        return lambda scope: left(scope) * right(scope)
    if operator == "/":
        return lambda scope: left(scope) / right(scope)
    if operator == "%":
        return lambda scope: math.fmod(left(scope), right(scope))
    raise SafeMathExpressionError(f"Unsupported operator {operator!r}")


@dataclass(frozen=True)
class _Token:
    kind: str
    value: str | float | None = None


def _tokenize(source: str) -> list[_Token]:
    tokens: list[_Token] = []
    index = 0
    while index < len(source):
        char = source[index]
        if char.isspace():
            index += 1
            continue
        if char == "(":
            tokens.append(_Token("lparen"))
            index += 1
        elif char == ")":
            tokens.append(_Token("rparen"))
            index += 1
        elif char == ",":
            tokens.append(_Token("comma"))
            index += 1
        elif char in _OPERATOR_CHARS:
            tokens.append(_Token("op", char))
            index += 1
        elif char.isascii() and (char.isdigit() or char == "."):
            end = index
            while end < len(source) and (
                source[end].isascii()
                and (source[end].isdigit() or source[end] == ".")
            ):
                end += 1
            if end < len(source) and source[end] in {"e", "E"}:
                exponent_end = end + 1
                if exponent_end < len(source) and source[exponent_end] in {"+", "-"}:
                    exponent_end += 1
                if (
                    exponent_end < len(source)
                    and source[exponent_end].isascii()
                    and source[exponent_end].isdigit()
                ):
                    exponent_end += 1
                    while (
                        exponent_end < len(source)
                        and source[exponent_end].isascii()
                        and source[exponent_end].isdigit()
                    ):
                        exponent_end += 1
                    end = exponent_end
            raw_number = source[index:end]
            try:
                value = float(raw_number)
            except ValueError as exc:
                raise SafeMathExpressionError(f"Invalid number: {raw_number!r}") from exc
            if not math.isfinite(value):
                raise SafeMathExpressionError(f"Invalid number: {raw_number!r}")
            tokens.append(_Token("number", value))
            index = end
        elif char.isascii() and (char.isalpha() or char == "_"):
            end = index + 1
            while end < len(source):
                candidate = source[end]
                if not candidate.isascii() or not (
                    candidate.isalnum() or candidate == "_"
                ):
                    break
                end += 1
            tokens.append(_Token("name", source[index:end]))
            index = end
        else:
            raise SafeMathExpressionError(
                f"Unexpected character {char!r} at position {index}"
            )
        if len(tokens) > _MAX_TOKENS:
            raise SafeMathExpressionError("Expression has too many tokens")
    return tokens


class _Parser:
    def __init__(self, tokens: list[_Token]) -> None:
        self._tokens = tokens
        self._position = 0

    def parse(self) -> CompiledExpression:
        expression = self._parse_expression(0)
        if self._position != len(self._tokens):
            raise SafeMathExpressionError("Unexpected trailing tokens in expression")
        return expression

    def _peek(self) -> _Token | None:
        if self._position >= len(self._tokens):
            return None
        return self._tokens[self._position]

    def _next(self) -> _Token:
        token = self._peek()
        if token is None:
            raise SafeMathExpressionError("Unexpected end of expression")
        self._position += 1
        return token

    @staticmethod
    def _check_depth(depth: int) -> None:
        if depth > _MAX_NESTING:
            raise SafeMathExpressionError("Expression nesting is too deep")

    def _parse_expression(self, depth: int) -> CompiledExpression:
        self._check_depth(depth)
        left = self._parse_term(depth)
        while True:
            token = self._peek()
            if token is None or token.kind != "op" or token.value not in {"+", "-"}:
                return left
            self._next()
            right = self._parse_term(depth)
            left = _binary_expression(str(token.value), left, right)

    def _parse_term(self, depth: int) -> CompiledExpression:
        left = self._parse_power(depth)
        while True:
            token = self._peek()
            if token is None or token.kind != "op" or token.value not in {"*", "/", "%"}:
                return left
            self._next()
            right = self._parse_power(depth)
            left = _binary_expression(str(token.value), left, right)

    def _parse_power(self, depth: int) -> CompiledExpression:
        base = self._parse_unary(depth)
        token = self._peek()
        if token is None or token.kind != "op" or token.value != "^":
            return base
        self._next()
        exponent = self._parse_power(depth + 1)
        return lambda scope: math.pow(base(scope), exponent(scope))

    def _parse_unary(self, depth: int) -> CompiledExpression:
        token = self._peek()
        if token is not None and token.kind == "op" and token.value in {"+", "-"}:
            self._next()
            operand = self._parse_unary(depth + 1)
            if token.value == "-":
                return lambda scope: -operand(scope)
            return operand
        return self._parse_primary(depth)

    def _parse_primary(self, depth: int) -> CompiledExpression:
        self._check_depth(depth)
        token = self._next()
        if token.kind == "number":
            value = float(token.value)  # type: ignore[arg-type]
            return lambda _scope: value
        if token.kind == "lparen":
            inner = self._parse_expression(depth + 1)
            if self._next().kind != "rparen":
                raise SafeMathExpressionError('Expected ")"')
            return inner
        if token.kind != "name":
            raise SafeMathExpressionError("Unexpected token in expression")

        name = str(token.value)
        return self._parse_name(name, depth)

    def _parse_name(self, name: str, depth: int) -> CompiledExpression:
        lookahead = self._peek()
        if lookahead is not None and lookahead.kind == "lparen":
            function = _FUNCTIONS.get(name)
            if function is None:
                raise SafeMathExpressionError(f"Unknown function {name!r}")
            self._next()
            arguments: list[CompiledExpression] = []
            if self._peek() is not None and self._peek().kind != "rparen":
                arguments.append(self._parse_expression(depth + 1))
                while self._peek() is not None and self._peek().kind == "comma":
                    self._next()
                    arguments.append(self._parse_expression(depth + 1))
                    if len(arguments) > _MAX_FUNCTION_ARGUMENTS:
                        raise SafeMathExpressionError("Function has too many arguments")
            if self._next().kind != "rparen":
                raise SafeMathExpressionError(
                    f'Expected ")" after arguments to {name!r}'
                )
            return lambda scope: float(
                function(*(argument(scope) for argument in arguments))
            )
        if name in _CONSTANTS:
            value = _CONSTANTS[name]
            return lambda _scope: value

        def variable(scope: Scope) -> float:
            value = scope.get(name)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise SafeMathExpressionError(f"Unknown variable {name!r}")
            return float(value)

        return variable


@lru_cache(maxsize=128)
def compile_safe_math_expression(source: str) -> CompiledExpression:
    """Compile the frontend mathExpr grammar without eval or dynamic code."""

    trimmed = (source or "").strip()
    if not trimmed:
        raise SafeMathExpressionError("Empty expression")
    if len(trimmed) > _MAX_SOURCE_LENGTH:
        raise SafeMathExpressionError("Expression is too long")
    parsed = _Parser(_tokenize(trimmed)).parse()

    def evaluate(scope: Scope) -> float:
        try:
            return float(parsed(scope))
        except SafeMathExpressionError:
            raise
        except (ArithmeticError, TypeError, ValueError) as exc:
            raise SafeMathExpressionError("Expression evaluation failed") from exc

    return evaluate
