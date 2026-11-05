### Numerical Methods – Unit I & II

2 Marks • Exam-oriented answers

These answers are prepared according to your syllabus. They are short, easy to understand and suitable for writing in your examination.

### 1\. Differentiate between Rounding and Chopping with a suitable example.

Rounding: It is the process of reducing the number of digits by increasing the last retained digit by 1 if the next digit is 5 or greater.

Example: 3.1467 rounded to 3 decimal places = 3.147.

Chopping: It is the process of removing unwanted digits without changing the last retained digit.

Example: 3.1467 chopped to 3 decimal places = 3.146.

### 2\. Define Order of Convergence of Iterative Methods.

The order of convergence is the measure of the speed at which an iterative method approaches the exact root.

Mathematically,

\\boxed{\\lim_{n\\to\\infty}
\\frac{|e_{n+1}|}{|e_n|^p}=C}

where:

* = error at nth iteration.

* = order of convergence.

* = positive constant.

### 3\. Define Bisection Method with Formula.

The Bisection Method is a numerical method used to find the root of a nonlinear equation by repeatedly dividing an interval into two equal parts.

If , the midpoint is calculated as:

\\boxed{x_n=\\frac{a+b}{2}}

The interval containing the root is selected and the process is repeated until the required accuracy is obtained.

### 4\. Write the formulas of Secant Method and Newton-Raphson Method.

(a) Secant Method:

The iterative formula is:

\\boxed{x_{n+1}=x_n-
\\frac{f(x_n)(x_n-x_{n-1})}
{f(x_n)-f(x_{n-1})}}

(b) Newton-Raphson Method:

The iterative formula is:

\\boxed{x_{n+1}=x_n-
\\frac{f(x_n)}{f'(x_n)}}

Both methods are used to find approximate roots of nonlinear equations.

### 5\. What is the Geometrical Interpretation of Regula Falsi Method?

The Regula Falsi Method (False Position Method) is a numerical method in which a straight line is drawn between two points and on the curve.

The point where this straight line intersects the x-axis gives the approximate root.

Its formula is:

\\boxed{x=\\frac{af(b)-bf(a)}{f(b)-f(a)}}

The process is repeated until the desired accuracy is obtained.

Important for your examination:

| Topic | Unit | Important formula |
| --- | --- | --- |
| Rounding and Chopping | I | Numerical approximation |
| Order of Convergence | I | Error formula |
| Bisection Method | II | Midpoint formula |
| Secant Method | II | Iterative formula |
| Newton-Raphson Method | II | Iterative formula |
| Regula Falsi Method | II | False position formula |

Study tip: Give special attention to the formulas in Questions 3, 4 and 5. They are important for both theory and numerical problems.
