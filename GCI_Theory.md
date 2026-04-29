# GCI (Grid Convergence Index) 이론 및 계산 가이드
## STAR-CCM+ Grid Sensitivity Test 적용

---

## 1. 개요 (Overview)

### 1.1 GCI란?

**Grid Convergence Index (GCI)**는 1994년 Patrick J. Roache가 제안한 방법으로, CFD(전산유체역학) 수치 해석에서 **격자(Mesh) 이산화 오차를 정량적으로 추정**하는 표준화된 방법이다.

CFD 해석에서 수치 해는 격자의 크기에 따라 달라진다. 격자를 무한히 세밀하게 만들수록 수치 해는 이론적 "정확해(exact solution)"에 수렴하지만, 실제로는 계산 자원의 한계로 특정 크기의 격자를 사용한다. GCI는 이 격자 크기로 인한 **이산화 불확실도(discretization uncertainty)**를 수치적으로 정량화한다.

> **핵심 목적**: "현재 사용 중인 격자로 얻은 해가 격자 무관(grid-independent) 해에 얼마나 가까운가?"를 백분율로 표현

### 1.2 관련 참고 문헌

| 문헌 | 내용 |
|------|------|
| Roache (1994) | GCI 최초 제안. *Journal of Fluids Engineering*, 116(3), 405–413 |
| Celik et al. (2008) | ASME 표준 GCI 절차. *Journal of Fluids Engineering*, 130, 078001 |
| NASA V&V Best Practices | NASA 검증·확인 가이드라인 |
| ITTC (2021) | 선박/해양 분야 GCI 적용 가이드 |

---

## 2. 핵심 개념 (Core Concepts)

### 2.1 이산화 오차 (Discretization Error)

수치 해석에서 편미분방정식(PDE)은 이산화된 대수 방정식으로 변환된다. 이 과정에서 발생하는 오차가 **이산화 오차**이다.

일반적으로 수치 해 φ는 다음과 같이 표현된다:

```
φ_numerical = φ_exact + C·h^p + O(h^(p+1))
```

여기서:
- `φ_exact` : 이론적 정확해
- `C` : 상수
- `h` : 격자 크기 (대표 격자 간격)
- `p` : 수치 기법의 이론적 정확도 차수 (formal order of accuracy)

→ 격자가 세밀해질수록(h→0) 수치 해는 정확해에 수렴

### 2.2 수렴 차수 (Order of Convergence)

| 기법 | 이론 차수 (p) |
|------|-------------|
| 1차 유한차분/유한체적 | 1 |
| 2차 유한차분/유한체적 | 2 |
| STAR-CCM+ 기본 (2차 UDS) | 2 |
| 고차 기법 (High-order) | 3 이상 |

> **주의**: 이론 차수(formal order)와 관측 차수(observed/apparent order)는 다를 수 있다. 실제 격자 연구에서는 **관측 차수(p_obs)**를 직접 계산하는 것이 권장된다.

### 2.3 대표 격자 크기 h (Representative Grid Size)

#### 3D 비정형 격자 (STAR-CCM+ Polyhedral/Trimmed 등):

$$h = \left[\frac{1}{N}\sum_{i=1}^{N}(\Delta V_i)\right]^{1/3} \approx \left(\frac{V_{domain}}{N}\right)^{1/3}$$

- `N` : 전체 셀 수 (Total Cell Count)
- `ΔV_i` : 각 셀의 체적
- `V_domain` : 도메인 전체 체적 (단, 지역 정제가 있을 경우 정확한 합산 필요)

#### 2D 비정형 격자:

$$h = \left[\frac{1}{N}\sum_{i=1}^{N}(\Delta A_i)\right]^{1/2} \approx \left(\frac{A_{domain}}{N}\right)^{1/2}$$

#### STAR-CCM+에서 실용적 접근:
STAR-CCM+에서 Base Size를 균일하게 조정하는 경우, 격자 비율 r을 다음으로 근사할 수 있다:

```
r = BaseSize_coarse / BaseSize_fine
```

또는 셀 수로부터:

```
r_3D = (N_fine / N_coarse)^(1/3)    ← 3D
r_2D = (N_fine / N_coarse)^(1/2)    ← 2D
```

---

## 3. GCI 계산 절차 (Celik et al., 2008 기준)

### 3.1 필요 조건

- 최소 **3개의 체계적으로 정제된 격자** (조대 Coarse, 중간 Medium, 정밀 Fine)
- 격자 정제 비율 `r ≥ 1.3` 권장
- 각 격자에서 **동일한 물리량** (관심 변수 φ) 추출
- 반복 수렴 (iterative convergence) 충분히 달성 후 데이터 추출

### 3.2 입력 변수 정의

| 기호 | 설명 |
|------|------|
| h₁ | Fine 격자의 대표 격자 크기 (가장 작음) |
| h₂ | Medium 격자의 대표 격자 크기 |
| h₃ | Coarse 격자의 대표 격자 크기 (가장 큼) |
| φ₁ | Fine 격자 해석 결과 |
| φ₂ | Medium 격자 해석 결과 |
| φ₃ | Coarse 격자 해석 결과 |

> 정렬 규칙: `h₁ < h₂ < h₃` (1 = 최정밀, 3 = 최조대)

### 3.3 Step 1: 격자 정제 비율 계산

$$r_{21} = \frac{h_2}{h_1}, \quad r_{32} = \frac{h_3}{h_2}$$

**검증**: `r_{21} ≥ 1.3` 및 `r_{32} ≥ 1.3` 만족 여부 확인

### 3.4 Step 2: 상대 오차 계산

$$\varepsilon_{21} = \phi_2 - \phi_1$$
$$\varepsilon_{32} = \phi_3 - \phi_2$$

**수렴 유형 확인**:
- `ε₃₂/ε₂₁ > 0` : **단조 수렴 (Monotonic convergence)** → GCI 적용 가능
- `ε₃₂/ε₂₁ < 0` : **진동 수렴 (Oscillatory convergence)** → GCI 결과 신뢰도 낮음
- `|ε₂₁| < |ε₃₂|` 이면서 단조: 수렴 중
- `|ε₂₁| > |ε₃₂|` : 발산 가능성 → 격자 설정 재검토

### 3.5 Step 3: 관측 수렴 차수 계산 (Apparent Order)

$$p = \frac{1}{\ln(r_{21})}\left|\ln\left|\frac{\varepsilon_{32}}{\varepsilon_{21}}\right| + q(p)\right|$$

여기서:
$$q(p) = \ln\left(\frac{r_{21}^p - s}{r_{32}^p - s}\right)$$
$$s = \text{sgn}\left(\frac{\varepsilon_{32}}{\varepsilon_{21}}\right) = \begin{cases} +1 & \text{if } \varepsilon_{32}/\varepsilon_{21} > 0 \\ -1 & \text{if } \varepsilon_{32}/\varepsilon_{21} < 0 \end{cases}$$

**균일 격자 정제 비율인 경우 (`r₂₁ = r₃₂ = r`)**, q(p) = 0이 되어 단순화:

$$p = \frac{\ln(\varepsilon_{32}/\varepsilon_{21})}{\ln(r)}$$

#### 반복 계산 (Fixed-Point Iteration):
1. 초기 추정값 p₀ = 이론 차수 (예: 2)로 시작
2. 위 방정식에 대입하여 새 p 계산
3. 수렴할 때까지 반복 (일반적으로 5~20회 반복으로 수렴)

### 3.6 Step 4: Richardson 외삽 (Richardson Extrapolation)

격자 무한 정제 시의 외삽값(격자 독립 해 추정):

$$\phi_{ext}^{21} = \frac{r_{21}^p \cdot \phi_1 - \phi_2}{r_{21}^p - 1}$$

이 값은 이론적 "격자 독립 해"의 추정치이다.

### 3.7 Step 5: 근사 상대 오차 (Approximate Relative Error)

$$e_a^{21} = \left|\frac{\phi_1 - \phi_2}{\phi_1}\right| \times 100\%$$

$$e_a^{32} = \left|\frac{\phi_2 - \phi_3}{\phi_2}\right| \times 100\%$$

### 3.8 Step 6: 외삽 상대 오차 (Extrapolated Relative Error)

$$e_{ext}^{21} = \left|\frac{\phi_{ext}^{21} - \phi_1}{\phi_{ext}^{21}}\right| \times 100\%$$

$$e_{ext}^{32} = \left|\frac{\phi_{ext}^{32} - \phi_2}{\phi_{ext}^{32}}\right| \times 100\%$$

### 3.9 Step 7: GCI 계산 (Grid Convergence Index)

$$\text{GCI}_{fine}^{21} = \frac{F_s \cdot e_a^{21}}{r_{21}^p - 1}$$

$$\text{GCI}_{medium}^{32} = \frac{F_s \cdot e_a^{32}}{r_{32}^p - 1}$$

**안전계수 (Factor of Safety, Fs)**:
| 격자 수 | Fs 권장값 | 비고 |
|---------|----------|------|
| 2개 격자 | 3.0 | 관측 차수 계산 불가, 권장하지 않음 |
| **3개 이상** | **1.25** | 표준 (ASME, Celik et al. 2008) |

### 3.10 Step 8: 점근적 수렴 확인 (Asymptotic Range Check)

$$\text{Check} = \frac{\text{GCI}_{medium}^{32}}{r_{21}^p \cdot \text{GCI}_{fine}^{21}}$$

| 결과 | 해석 |
|------|------|
| ≈ 1.0 (±0.05) | ✅ 점근적 수렴 범위 내 → GCI 결과 신뢰 |
| ≪ 1.0 또는 ≫ 1.0 | ⚠️ 점근적 수렴 범위 밖 → 더 세밀한 격자 필요 |

---

## 4. 결과 해석 (Interpretation)

### 4.1 GCI 의미

`GCI_fine = 2.5%` → Fine 격자의 해석 결과가 격자 독립 해로부터 **최대 2.5% 이내**에 있음을 95% 신뢰 수준으로 의미

### 4.2 수렴 품질 판정 기준

| GCI_fine 값 | 평가 |
|------------|------|
| < 1% | 🟢 우수: 격자 독립성 달성 |
| 1% ~ 3% | 🟡 양호: 공학적으로 수용 가능 |
| 3% ~ 5% | 🟠 보통: 추가 정제 권장 |
| > 5% | 🔴 불량: 격자 독립성 미달성, 추가 정제 필요 |

### 4.3 수렴 유형별 대응

| 수렴 유형 | 조건 | 대응 방법 |
|----------|------|----------|
| 단조 수렴 | ε₃₂/ε₂₁ > 0, 절댓값 감소 | 표준 GCI 적용 |
| 진동 수렴 | ε₃₂/ε₂₁ < 0 | GCI 신뢰도 낮음; 격자 전략 재검토 |
| 관측 차수 이상 (p > p_theo+1) | p 과추정 | 격자가 아직 점근 범위 미진입 |
| 관측 차수 이하 (p < 0.5) | p 과소추정 | 격자 해상도 부족 또는 발산 |

---

## 5. STAR-CCM+ 적용 가이드

### 5.1 격자 생성 전략

#### Base Size 기반 정제 (권장):
```
Fine    Base Size = BS
Medium  Base Size = BS × r       (예: r = 1.3 → 1.3×BS)
Coarse  Base Size = BS × r²      (예: r = 1.3 → 1.69×BS)
```

#### 일반적인 r 값 선택:
| r 값 | 특징 |
|------|------|
| √2 ≈ 1.414 | 2D에서 셀 면적 2배, 자주 사용 |
| ∛2 ≈ 1.260 | 3D에서 셀 수 2배, 실용적 |
| 1.5 | 격자 차이 명확, GCI 계산 안정 |
| 2.0 | 격자 차이 매우 큼, 점근 범위 진입 불확실 |

#### STAR-CCM+ 체크리스트:
- [ ] 세 격자 모두 동일한 Mesh Topology (Polyhedral, Trimmed 등)
- [ ] Prism Layer 설정 동일 유지 (두께, 층수 등)
- [ ] Local Refinement Zone이 있다면 모두 동일한 비율로 정제
- [ ] 경계 조건, 솔버 설정, 물성치 동일
- [ ] 반복 수렴 충분히 달성 (잔류값 4~5 오더 감소)

### 5.2 관심 변수 선택

GCI에 사용할 변수는 **전역 적분량(Global Integral Quantity)**이 국소값(Local Value)보다 선호된다:

| 변수 유형 | 예시 | 권장도 |
|----------|------|--------|
| 전역 적분량 | 항력계수 (CD), 양력계수 (CL), 압력손실 (ΔP), 열 유속 (Q) | ✅ 강력 권장 |
| 단면 평균값 | 면 평균 속도, 유량 | ✅ 권장 |
| 국소값 | 특정 위치 압력, 속도 | ⚠️ 주의 필요 |

### 5.3 STAR-CCM+에서 데이터 추출

1. **Reports** 기능으로 관심 변수 모니터링 설정
2. **Monitors & Plots** 통해 수렴 확인
3. 수렴 후 마지막 100 iteration 평균값을 사용하는 것이 안정적
4. 격자별 셀 수는 `Mesh → Diagnostics` 또는 `Representations` 에서 확인

### 5.4 보고 형식 (Reporting Format)

GCI 분석 결과를 보고할 때 포함할 항목:

| 항목 | 예시 |
|------|------|
| 격자 명칭 | Coarse / Medium / Fine |
| 셀 수 | N₁, N₂, N₃ |
| 대표 격자 크기 | h₁, h₂, h₃ |
| 정제 비율 | r₂₁, r₃₂ |
| 관심 변수 값 | φ₁, φ₂, φ₃ |
| 관측 수렴 차수 | p |
| Richardson 외삽값 | φ_ext |
| 근사 상대 오차 | e_a^21, e_a^32 |
| GCI_fine | GCI₂₁ |
| GCI_medium | GCI₃₂ |
| 점근 수렴 확인 | ≈ 1.0? |

---

## 6. 수식 요약표

| 수식 | 식 |
|------|-----|
| 대표 격자 크기 (3D) | h = (V/N)^(1/3) |
| 정제 비율 | r₂₁ = h₂/h₁ |
| 상대 오차 | ε₂₁ = φ₂ − φ₁ |
| 수렴 차수 (단순) | p = ln(ε₃₂/ε₂₁) / ln(r) |
| Richardson 외삽 | φ_ext = (r²¹^p · φ₁ − φ₂) / (r₂₁^p − 1) |
| 근사 상대 오차 | e_a^21 = |φ₁ − φ₂| / |φ₁| × 100% |
| GCI (fine) | GCI_fine = Fs · e_a^21 / (r₂₁^p − 1) |
| 점근 확인 | Check = GCI₃₂ / (r₂₁^p · GCI₂₁) |

---

## 7. 주의사항 및 한계

1. **GCI는 오차 추정기이지, 정확한 오차가 아니다.** 이산화 오차만을 추정하며, 모델링 오차(turbulence model 등)는 포함하지 않는다.

2. **점근 수렴 범위 진입이 전제.** 격자가 아직 수치 점근 범위에 진입하지 않으면 GCI가 과대 또는 과소 추정될 수 있다.

3. **관측 차수(p) 범위 확인.** 일반적으로 `0 < p ≤ p_formal + 1` 범위를 벗어나면 점근 범위 미진입으로 판단한다.

4. **진동 수렴 시 주의.** ε₃₂/ε₂₁ < 0이면 수렴 거동이 비단조적으로, GCI의 신뢰성이 떨어진다.

5. **이산화 오차 vs 총 수치 오차.** GCI는 이산화 오차만 추정하며, 반복 수렴 오차, 반올림 오차 등은 별도로 관리해야 한다.

---

*참고: Celik, I.B. et al. (2008). "Procedure for Estimation and Reporting of Uncertainty Due to Discretization in CFD Applications." ASME Journal of Fluids Engineering, 130(7), 078001.*
