from ddf.application.dsl import Expression, Group


def and_expressions(
    *expressions: Expression | None,
) -> Expression | None:
    filters = tuple(expression for expression in expressions if expression is not None)

    if not filters:
        return None

    if len(filters) == 1:
        return filters[0]

    return Group(op="$and", filters=filters)


def or_expressions(
    *expressions: Expression | None,
) -> Expression | None:
    filters = tuple(expression for expression in expressions if expression is not None)

    if not filters:
        return None

    if len(filters) == 1:
        return filters[0]

    return Group(op="$or", filters=filters)
